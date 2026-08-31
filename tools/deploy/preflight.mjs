// tools/deploy/preflight.mjs
// Pre-deploy safety checks: the protected-files set, the per-env target-path
// guard (the one FTP account reaches every environment), and the
// api-laravel/.env key-shape check.
//
// That last one used to parse each server's config.php to an AST. config.php
// is gone with the old front end; Laravel's .env is now the only server-owned
// configuration, and a dotenv key set is a line-regex rather than a parse — so
// this no longer needs php-parser at all. Key *values* are never read,
// returned or logged, so a server's credentials cannot leak into deploy output.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { STATE_FILE } from './state.mjs';

// Files that live on the server and must never be uploaded or deleted (plus
// the state file, which this tool owns and writes separately). Matched by
// BASENAME at any depth (see sync.mjs), which is what protects the nested
// api-laravel/.env — Laravel's server-owned config (APP_KEY, DB credentials,
// MIGRATE_TOKEN, ALTCHA_HMAC_SECRET). tools/build.mjs strips it from the
// artifact, so without this entry a --relist or bootstrap deploy would
// classify it as a stale remote file and delete the API's entire
// configuration.
//
// config.php stays listed even though the code no longer has one: every server
// still HAS the file, and this set is what stops a bootstrap or --relist deploy
// deleting files it did not put there. It should be removed by hand, once per
// server, and can drop out of this set after that.
export const PROTECTED = new Set([
  '.htaccess',
  'robots.txt',
  'config.php',
  '.htpasswd',
  '.env',
  STATE_FILE,
]);

// FTP_DIR must name the target env as its own path/subdomain segment, so a
// mistyped dir can never deploy to — or delete from! — the wrong environment.
const GUARDS = {
  test: /(^|[/.])test([/.]|$)/i,
  qa: /(^|[/.])qa([/.]|$)/i,
  prod: /(^|[/.])prod([/.]|$)/i,
};
export const TARGETS = Object.keys(GUARDS);

export function checkTargetDir(target, dir) {
  if (GUARDS[target].test(dir)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `Refusing to run: FTP_DIR="${dir}" does not look like the ${target.toUpperCase()} target. ` +
      `This account can reach other environments too, so deploy only runs against a path matching "${target}".`,
  };
}

/**
 * The KEYS a dotenv file declares, sorted and de-duplicated.
 *
 * Values are never captured, so nothing downstream can log a credential. A
 * commented-out line declares nothing; a key with an empty value still counts
 * as declared, because an unset value is a value problem and this check is
 * deliberately only about shape.
 */
export function envKeys(source) {
  const keys = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

// Pure comparison of two key lists (expected = what the deployed code needs,
// actual = what the server declares).
export function compareEnvShape(expected, actual) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((k) => !actualSet.has(k));
  const extra = actual.filter((k) => !expectedSet.has(k));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

// Fetch the target's api-laravel/.env and compare its key set against
// api/.env.example (the source of truth for what the deployed code expects), so
// a deploy that would land code needing a key the server has never been given
// fails here rather than 500ing every /api/* request afterwards. Best-effort on
// fetch: a brand-new environment has no .env yet — the API can't run either
// way, so blocking wouldn't add protection there; report `skipped` and let the
// caller warn.
export async function checkEnvShape(client, remoteRoot) {
  const expected = envKeys(readFileSync('api/.env.example', 'utf8'));
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-env-'));
  const tmpEnv = path.join(tmpDir, 'env');
  try {
    try {
      await client.downloadTo(tmpEnv, `${remoteRoot}/api-laravel/.env`);
    } catch (err) {
      return { ok: true, skipped: true, reason: err.message, missing: [], extra: [] };
    }
    return { skipped: false, ...compareEnvShape(expected, envKeys(readFileSync(tmpEnv, 'utf8'))) };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
