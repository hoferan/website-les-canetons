#!/usr/bin/env node
/**
 * Snapshots and restores the LOCAL development site — database and uploads.
 *
 *   node tools/wp-snapshot.mjs save            # capture the current state
 *   node tools/wp-snapshot.mjs list            # what has been captured
 *   node tools/wp-snapshot.mjs restore <name>  # put a snapshot back
 *
 * Invoked through `npm run wp:snapshot`, `wp:snapshot:list` and `wp:restore`.
 *
 * Why this exists: content is not in the repository (spec §10), so while page
 * copy is being authored locally the ONLY copy lives in Docker volumes —
 * `wp_db_data` for the database and `wp_core` for wp-content/uploads. And
 * `npm run wp:reset` is `docker compose down -v`, which destroys both by design.
 * UpdraftPlus covers TEST and PROD (spec §11) but not a developer's laptop, so
 * hours of French and German copy plus every uploaded photo sit one command away
 * from being gone. This is that missing safety net, and it deliberately captures
 * uploads as well as the database, because losing the photos would hurt just as
 * much as losing the text.
 *
 * Node rather than shell, for the reasons given in tools/phpunit.mjs: npm runs
 * scripts through cmd.exe on Windows, and spawning with an argument array means
 * Git Bash's MSYS path rewriting cannot turn /var/www/html into a Windows path.
 *
 * Snapshots are local scratch, never committed — see the .snapshots/ rule in
 * .gitignore. They contain whatever the local database holds, so treat one as
 * real data if it was ever taken after a `canetons migrate` run.
 */

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const SNAPSHOT_DIR = path.join(process.cwd(), '.snapshots');
const DB_FILE = 'database.sql';
const UPLOADS_FILE = 'uploads.tar';
const MANIFEST_FILE = 'manifest.txt';

/**
 * The site locale the spec requires (there is no official fr_CH, so fr_FR it is).
 *
 * This is checked on every snapshot and restore because the locale has twice
 * silently reverted to an empty value, and a snapshot faithfully captured the
 * empty value and then re-applied it on restore. The Phase 5 seed carries content
 * to TEST the same way, so a wrong locale here is a wrong locale there.
 *
 * A mismatch WARNS and still proceeds. Refusing to take a snapshot would be the
 * wrong trade: a backup you declined to make is worse than a backup with a known
 * flaw recorded next to it.
 */
const EXPECTED_LOCALE = 'fr_FR';

// Paths inside the Linux containers, so forward slashes regardless of host OS.
const WP_CONTENT = '/var/www/html/wp-content';
const UPLOADS = `${WP_CONTENT}/uploads`;

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** Which compose services are up. `exec` needs the service running. */
function runningServices() {
  const r = spawnSync('docker', ['compose', 'ps', '--services', '--status', 'running'], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || !r.stdout) {
    return [];
  }
  return r.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function requireStack() {
  const running = runningServices();
  for (const service of ['wp', 'wp-db']) {
    if (!running.includes(service)) {
      die(`The ${service} service is not running.\n\nStart the stack:  npm run wp:dev`);
    }
  }
}

/** Run a docker command, streaming one std stream to/from a file descriptor. */
function docker(args, { stdin = 'inherit', stdout = 'inherit' } = {}) {
  const r = spawnSync('docker', args, { stdio: [stdin, stdout, 'inherit'] });
  if (r.error) {
    die(`Could not run docker: ${r.error.message}`);
  }
  return r.status ?? 1;
}

/** Run a docker command and return its trimmed stdout, or '' on failure. */
function dockerCapture(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  if (r.error || r.status !== 0 || typeof r.stdout !== 'string') {
    return '';
  }
  return r.stdout.trim();
}

/** The site's configured locale. Empty string means WordPress falls back to en_US. */
function siteLocale() {
  return dockerCapture([
    'compose', 'run', '--rm', 'wp-cli',
    'wp', '--path=/var/www/html', 'option', 'get', 'WPLANG',
  ]);
}

/**
 * Warn when the locale is not the one the site is supposed to run in. Returns the
 * locale so the caller can record it.
 */
function checkLocale(locale, context) {
  if (locale === EXPECTED_LOCALE) {
    return;
  }

  const shown = '' === locale ? "'' (WordPress falls back to en_US)" : `'${locale}'`;
  console.warn(
    `\n[snapshot] WARNING: the site locale is ${shown}, expected '${EXPECTED_LOCALE}'.\n` +
      `[snapshot] ${context}\n` +
      `[snapshot] Fix it with:  npm run wp:setup\n`
  );
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The locale a snapshot recorded, or null when it predates the manifest — a
 * snapshot taken before this check existed cannot be assumed good.
 */
function snapshotLocale(dir) {
  const manifest = path.join(dir, MANIFEST_FILE);
  if (!existsSync(manifest)) {
    return null;
  }

  const line = readFileSync(manifest, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('locale='));

  return undefined === line ? null : line.slice('locale='.length).trim();
}

/** Snapshot names sort chronologically because the stamp is ISO-derived. */
function listSnapshots() {
  if (!existsSync(SNAPSHOT_DIR)) {
    return [];
  }
  return readdirSync(SNAPSHOT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function save() {
  requireStack();

  // Colons and dots are awkward in directory names on Windows, so flatten the
  // ISO stamp rather than inventing a format.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const target = path.join(SNAPSHOT_DIR, stamp);
  mkdirSync(target, { recursive: true });

  // --- database ------------------------------------------------------------
  // --single-transaction keeps the dump consistent without locking, and
  // utf8mb4 matters: the copy is French and German, so accents and umlauts must
  // survive the round trip.
  const dbPath = path.join(target, DB_FILE);
  const dbFd = openSync(dbPath, 'w');
  let status;
  try {
    status = docker(
      [
        'compose', 'exec', '-T', 'wp-db',
        'mysqldump', '-uroot', '-proot',
        '--single-transaction', '--quick',
        '--default-character-set=utf8mb4',
        'wordpress',
      ],
      { stdin: 'ignore', stdout: dbFd }
    );
  } finally {
    closeSync(dbFd);
  }
  if (status !== 0) {
    die(`mysqldump failed (exit ${status}). The snapshot at ${target} is incomplete.`);
  }
  console.log(`[snapshot] database  ${humanSize(statSync(dbPath).size)}`);

  // --- uploads -------------------------------------------------------------
  // Absent until the first media upload, which is not an error. Tarred from
  // inside the container as root, so the archive keeps www-data ownership and a
  // restore does not leave files Apache cannot write.
  const hasUploads =
    docker(['compose', 'exec', '-T', 'wp', 'test', '-d', UPLOADS], {
      stdin: 'ignore',
      stdout: 'ignore',
    }) === 0;

  if (!hasUploads) {
    console.log('[snapshot] uploads   (none yet)');
  } else {
    const upPath = path.join(target, UPLOADS_FILE);
    const upFd = openSync(upPath, 'w');
    try {
      status = docker(
        ['compose', 'exec', '-T', 'wp', 'tar', '-cf', '-', '-C', WP_CONTENT, 'uploads'],
        { stdin: 'ignore', stdout: upFd }
      );
    } finally {
      closeSync(upFd);
    }
    if (status !== 0) {
      die(`Archiving uploads failed (exit ${status}). The snapshot at ${target} is incomplete.`);
    }
    console.log(`[snapshot] uploads   ${humanSize(statSync(upPath).size)}`);
  }

  // --- manifest -------------------------------------------------------------
  // Recorded so `list` can show it and a future reader can tell whether a given
  // snapshot predates or postdates a locale problem, without loading it.
  const locale = siteLocale();
  writeFileSync(
    path.join(target, MANIFEST_FILE),
    [`locale=${locale}`, `expected_locale=${EXPECTED_LOCALE}`, `stamp=${stamp}`].join('\n') + '\n'
  );
  console.log(`[snapshot] locale    ${'' === locale ? '(empty)' : locale}`);

  console.log(`[snapshot] saved as ${stamp}`);
  console.log(`[snapshot] restore with:  npm run wp:restore ${stamp}`);

  checkLocale(locale, 'This snapshot has captured that, and restoring it will put it back.');
}

function list() {
  const snapshots = listSnapshots();
  if (snapshots.length === 0) {
    console.log('No snapshots yet. Take one with:  npm run wp:snapshot');
    return;
  }
  console.log(`Snapshots in .snapshots/ (${snapshots.length}):\n`);
  for (const name of snapshots) {
    const dir = path.join(SNAPSHOT_DIR, name);
    const parts = [];
    for (const file of [DB_FILE, UPLOADS_FILE]) {
      const full = path.join(dir, file);
      if (existsSync(full)) {
        parts.push(`${file} ${humanSize(statSync(full).size)}`);
      }
    }

    // Flag a snapshot whose locale is wrong: restoring it would reintroduce the
    // fault, and it must never be the one seeded to TEST.
    const locale = snapshotLocale(dir);
    const flag =
      null === locale ? 'locale unknown' : locale === EXPECTED_LOCALE ? locale : `locale ${'' === locale ? '(empty)' : locale} <-- WRONG`;

    console.log(`  ${name}   ${parts.join(', ')}, ${flag}`);
  }
}

function restore(name) {
  // No implicit "latest": this overwrites the database, so the caller names the
  // snapshot they mean.
  if (!name) {
    const available = listSnapshots();
    die(
      `Which snapshot?  npm run wp:restore <name>\n\n` +
        (available.length
          ? `Available:\n${available.map((n) => `  ${n}`).join('\n')}`
          : `There are none yet. Take one with:  npm run wp:snapshot`)
    );
  }

  const dir = path.join(SNAPSHOT_DIR, name);
  const dbPath = path.join(dir, DB_FILE);
  if (!existsSync(dbPath)) {
    die(`No database dump at ${dbPath}.\n\nList what exists:  npm run wp:snapshot:list`);
  }

  requireStack();
  console.log(`[restore] ${name} — overwriting the local database`);

  const dbFd = openSync(dbPath, 'r');
  let status;
  try {
    status = docker(
      ['compose', 'exec', '-T', 'wp-db', 'mysql', '-uroot', '-proot', '--default-character-set=utf8mb4', 'wordpress'],
      { stdin: dbFd, stdout: 'inherit' }
    );
  } finally {
    closeSync(dbFd);
  }
  if (status !== 0) {
    die(`Restoring the database failed (exit ${status}).`);
  }
  console.log('[restore] database restored');

  const upPath = path.join(dir, UPLOADS_FILE);
  if (!existsSync(upPath)) {
    console.log('[restore] uploads   (none in this snapshot)');
  } else {
    const upFd = openSync(upPath, 'r');
    try {
      status = docker(['compose', 'exec', '-T', 'wp', 'tar', '-xf', '-', '-C', WP_CONTENT], {
        stdin: upFd,
        stdout: 'inherit',
      });
    } finally {
      closeSync(upFd);
    }
    if (status !== 0) {
      die(`Restoring uploads failed (exit ${status}).`);
    }
    console.log('[restore] uploads restored');
  }

  // Checked AFTER restoring, against the live site rather than the manifest: what
  // matters is the locale you are left with, and this is the exact path by which a
  // wrong one came back once already.
  checkLocale( siteLocale(), 'The restored snapshot carried that locale.' );

  console.log('[restore] done — http://localhost:8100');
}

const command = process.argv[2];
switch (command) {
  case 'save':
    save();
    break;
  case 'list':
    list();
    break;
  case 'restore':
    restore(process.argv[3]);
    break;
  default:
    die('Usage: node tools/wp-snapshot.mjs <save|list|restore <name>>');
}
