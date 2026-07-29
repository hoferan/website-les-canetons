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
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SNAPSHOT_DIR = path.join(process.cwd(), '.snapshots');
const DB_FILE = 'database.sql';
const UPLOADS_FILE = 'uploads.tar';

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

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  console.log(`[snapshot] saved as ${stamp}`);
  console.log(`[snapshot] restore with:  npm run wp:restore ${stamp}`);
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
    console.log(`  ${name}   ${parts.join(', ')}`);
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
