// tools/host-probe.mjs
// Reads a server's PHP and MariaDB limits before it runs the current API, when
// GET /api/health cannot answer yet (#229).
//
//   npm run probe-host:test|qa|prod
//
// It uploads one PHP file to assets/<random>.php over FTP, POSTs a random token
// to it, prints what it answers, then deletes it and checks it is gone. assets/
// is the one directory both the old site's .htaccess and the current template
// leave out of their rewrite, so a .php file there runs as itself.
//
// The file refuses without the token, deletes itself on its first answer and
// on any refused request after 15 minutes, so a crash between upload and
// delete leaves nothing usable behind. It reads the database credentials on
// the server, from the old site's config.php or else _api/.env, and never
// prints them; a failed connection reports the MariaDB error code alone,
// because the message names the user.
//
// To upload it by hand instead, `-- --write <dir>` writes the file and prints
// its token without touching any server. Upload it to assets/, open
// /assets/<name>.php?token=<token> once (it answers, then deletes itself), and
// check it answers 404 afterwards. The token in a query string reaches the
// access log, which is harmless for a file that is gone after one answer.
//
// Exit codes: 0 ok, 1 failure, 2 refused by a guard.
import ftp from 'basic-ftp';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { loadDotEnv } from './dotenv.mjs';
import { TARGETS, checkTargetDir } from './deploy/preflight.mjs';

// What one image upload needs (ADR 0028, docs/traps.md): three 600 KB parts
// plus a 16 KB envelope in one request, and one MEDIUMBLOB row per part.
const PART_BYTES = 614_400;
export const NEEDS = {
  upload_max_filesize: PART_BYTES,
  post_max_size: 3 * PART_BYTES + 16_384,
  max_allowed_packet: PART_BYTES,
};

export const PROBE_PHP = `<?php
// One-shot host probe from tools/host-probe.mjs. Deletes itself.
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

$token = $_POST['token'] ?? $_GET['token'] ?? '';
if (!is_string($token) || !hash_equals('__TOKEN__', $token)) {
    if (time() - (int) @filemtime(__FILE__) > 900) {
        @unlink(__FILE__);
    }
    http_response_code(404);
    exit;
}
@unlink(__FILE__);

function probe_credentials(string $root): ?array
{
    if (is_file($root . '/config.php')) {
        $config = include $root . '/config.php';
        $db = is_array($config) ? ($config['db'] ?? null) : null;
        if (is_array($db) && isset($db['host'], $db['name'], $db['user'])) {
            return ['config.php', $db['host'], null, $db['name'], $db['user'], $db['pass'] ?? ''];
        }
    }
    $env = @file($root . '/_api/.env', FILE_IGNORE_NEW_LINES);
    if (is_array($env)) {
        $vars = [];
        foreach ($env as $line) {
            if (preg_match('/^\\\\s*([A-Z_]+)\\\\s*=\\\\s*(.*?)\\\\s*$/', $line, $m)) {
                $vars[$m[1]] = trim($m[2], '"\\'');
            }
        }
        if (isset($vars['DB_HOST'], $vars['DB_DATABASE'], $vars['DB_USERNAME'])) {
            return ['_api/.env', $vars['DB_HOST'], $vars['DB_PORT'] ?? null, $vars['DB_DATABASE'],
                $vars['DB_USERNAME'], $vars['DB_PASSWORD'] ?? ''];
        }
    }
    return null;
}

function probe_database(string $root): array
{
    $credentials = probe_credentials($root);
    if ($credentials === null) {
        return ['error' => 'no credentials found'];
    }
    [$source, $host, $port, $name, $user, $pass] = $credentials;
    try {
        $dsn = 'mysql:host=' . $host . ($port ? ';port=' . $port : '') . ';dbname=' . $name;
        $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
        $row = $pdo->query('SELECT @@GLOBAL.max_allowed_packet AS max_allowed_packet, VERSION() AS version')
            ->fetch(PDO::FETCH_ASSOC);
        $size = $pdo->query('SELECT SUM(data_length + index_length) FROM information_schema.tables'
            . ' WHERE table_schema = DATABASE()')->fetchColumn();
        return ['credentials' => $source, 'version' => $row['version'],
            'max_allowed_packet' => (int) $row['max_allowed_packet'], 'schema_bytes' => (int) $size];
    } catch (Throwable $e) {
        $code = $e instanceof PDOException ? ($e->errorInfo[1] ?? $e->getCode()) : $e->getCode();
        return ['credentials' => $source, 'error' => get_class($e), 'code' => $code];
    }
}

$ini = [];
foreach (['upload_max_filesize', 'post_max_size', 'memory_limit', 'max_execution_time', 'max_input_time',
    'max_file_uploads', 'user_ini.filename', 'user_ini.cache_ttl'] as $key) {
    $ini[$key] = ini_get($key);
}
$extensions = [];
foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'zip', 'intl', 'gd', 'sodium'] as $name) {
    $extensions[$name] = extension_loaded($name);
}
$root = dirname(__DIR__);
echo json_encode([
    'php_version' => PHP_VERSION,
    'sapi' => PHP_SAPI,
    'ini' => $ini,
    'extensions' => $extensions,
    'database' => probe_database($root),
    'filesystem' => [
        'free_bytes' => function_exists('disk_free_space') ? @disk_free_space($root) : null,
        'total_bytes' => function_exists('disk_total_space') ? @disk_total_space($root) : null,
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
`;

export function renderProbe(token) {
  if (!/^[0-9a-f]{64}$/.test(token)) {
    throw new Error('the probe token must be 64 hex characters');
  }
  return PROBE_PHP.replace('__TOKEN__', token);
}

/** A php.ini size ("32M", "1G", "512K", "8388608") in bytes; null when unparseable. */
export function iniBytes(value) {
  const m = /^\s*(\d+)\s*([KMG]?)\s*$/i.exec(String(value ?? ''));
  if (!m) {
    return null;
  }
  return Number(m[1]) * { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[2].toUpperCase()];
}

/** Each limit against what an upload needs: `{ name, bytes, needs, ok }`. */
export function verdicts(report) {
  const bytes = {
    upload_max_filesize: iniBytes(report.ini?.upload_max_filesize),
    post_max_size: iniBytes(report.ini?.post_max_size),
    max_allowed_packet: report.database?.max_allowed_packet ?? null,
  };
  return Object.entries(NEEDS).map(([name, needs]) => ({
    name,
    bytes: bytes[name],
    needs,
    ok: bytes[name] !== null && bytes[name] >= needs,
  }));
}

async function connect() {
  const client = new ftp.Client();
  await client.access({
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    secure: false,
  });
  return client;
}

// Delete the probe (it may already have deleted itself) and prove it is gone,
// over FTP and over HTTP. Throws if either still finds it.
async function removeProbe(remoteDir, name, url, headers) {
  const client = await connect();
  try {
    try {
      await client.remove(`${remoteDir}/${name}`);
      console.log(`  deleted ${name} over FTP`);
    } catch (err) {
      if (err.code !== 550) {
        throw err;
      }
      console.log(`  ${name} had already deleted itself`);
    }
    if ((await client.list(remoteDir)).some((i) => i.name === name)) {
      throw new Error(`${name} is still listed in ${remoteDir}`);
    }
  } finally {
    client.close();
  }
  const res = await fetch(url, { headers });
  const body = await res.text();
  if (body.includes('php_version')) {
    throw new Error(`${url} still answers the probe (HTTP ${res.status})`);
  }
  console.log(`  gone: not listed over FTP, HTTP answers ${res.status}`);
}

function writeProbe(dir) {
  const token = randomBytes(32).toString('hex');
  const file = join(dir, `probe-${randomBytes(16).toString('hex')}.php`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, renderProbe(token));
  console.log(`wrote ${file}\ntoken ${token}`);
}

async function main() {
  const [first, second, ...rest] = process.argv.slice(2);
  if (TARGETS.includes(first) && second === '--write' && rest.length === 1) {
    writeProbe(rest[0]);
    return;
  }
  const target = first;
  if (!TARGETS.includes(target) || second !== undefined) {
    console.error(`Usage: npm run probe-host:<${TARGETS.join('|')}> [-- --write <dir>]`);
    process.exit(1);
  }
  loadDotEnv(`.env.${target}`);
  loadDotEnv('.env');
  const missing = ['FTP_HOST', 'FTP_USER', 'FTP_PASS', 'FTP_DIR', 'SITE_URL'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')}: set them in .env.${target}.`);
    process.exit(1);
  }
  const guard = checkTargetDir(target, process.env.FTP_DIR);
  if (!guard.ok) {
    console.error(guard.message);
    process.exit(2);
  }

  const token = randomBytes(32).toString('hex');
  const name = `probe-${randomBytes(16).toString('hex')}.php`;
  const remoteDir = `${process.env.FTP_DIR}/assets`;
  const url = `${process.env.SITE_URL.replace(/\/$/, '')}/assets/${name}`;
  const headers = {};
  if (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASS) {
    const pair = `${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PASS}`;
    headers.Authorization = `Basic ${Buffer.from(pair).toString('base64')}`;
  }

  console.log(`PROBE ${target} -> assets/${name}`);
  let report;
  try {
    const client = await connect();
    try {
      await client.uploadFrom(Readable.from([renderProbe(token)]), `${remoteDir}/${name}`);
    } finally {
      client.close();
    }
    console.log('  uploaded');
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from the probe: ${body.slice(0, 300)}`);
    }
    report = JSON.parse(body);
  } finally {
    await removeProbe(remoteDir, name, url, headers);
  }

  console.log(JSON.stringify(report, null, 2));
  for (const v of verdicts(report)) {
    console.log(`  ${v.ok ? 'ok ' : 'LOW'} ${v.name}: ${v.bytes ?? 'unknown'} bytes, needs ${v.needs}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nprobe FAILED: ${err.message}`);
    process.exit(err.exitCode ?? 1);
  });
}
