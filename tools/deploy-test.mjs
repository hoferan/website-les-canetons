// Deploys the built code artifact (public/) to the TEST staging server over
// plain FTP. Uploads only new/changed files — "changed" = a different byte size
// on the server (FTP timestamps are unreliable on this host, so we don't trust
// them). Use --force to re-upload everything (needed for the rare edit that
// keeps a file's size identical). With --prune it also removes remote files the
// build no longer produces. The server-owned files
// (.htaccess, robots.txt, config.php, .htpasswd) are NEVER uploaded and NEVER
// pruned, so a deploy can't clobber TEST's access-control overlay or DB config.
//
//   npm run deploy:test               # upload new/changed files
//   npm run deploy:test -- --dry-run  # show the plan (new/changed/unchanged/stale), change nothing
//   npm run deploy:test -- --prune    # also delete remote files not in public/
//   npm run deploy:test -- --force    # re-upload every file, even unchanged ones
//
// Credentials come from a git-ignored .env (see .env.example). TEST only, on
// purpose — prod stays a manual promotion.
import ftp from 'basic-ftp';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const LOCAL_ROOT = 'public';

// Files that live on the server and must never be uploaded or pruned.
const PROTECTED = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd']);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PRUNE = args.includes('--prune');
const FORCE = args.includes('--force');

// --- minimal .env loader (no dependency) ----------------------------------
function loadDotEnv() {
  if (!existsSync('.env')) {
    return;
  }
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) {
      continue;
    }
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) {
      continue;
    }
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

// --- local file walk: relative posix path + size + mtime, excluding PROTECTED
function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, base));
    } else if (!PROTECTED.has(entry.name)) {
      const rel = path.relative(base, full).split(path.sep).join('/');
      out.push({ rel, size: statSync(full).size });
    }
  }
  return out;
}

// --- recursive remote listing: Map<relPath, size> -------------------------
async function listRemote(client, remoteBase, sub = '', acc = new Map()) {
  const dir = sub ? `${remoteBase}/${sub}` : remoteBase;
  for (const item of await client.list(dir)) {
    if (item.name === '.' || item.name === '..') {
      continue;
    }
    const rel = sub ? `${sub}/${item.name}` : item.name;
    if (item.isDirectory) {
      await listRemote(client, remoteBase, rel, acc);
    } else if (item.isFile) {
      // Only plain files are tracked. Symlinks / special entries (e.g. cgi-bin)
      // are deliberately ignored so --prune can never delete server infra.
      acc.set(rel, item.size);
    }
  }
  return acc;
}

function humanBytes(n) {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

async function main() {
  if (!existsSync(LOCAL_ROOT)) {
    console.error(`No ${LOCAL_ROOT}/ found — run "npm run build" first.`);
    process.exit(1);
  }

  loadDotEnv();
  const local = walk(LOCAL_ROOT).sort((a, b) => a.rel.localeCompare(b.rel));

  console.log(`TEST deploy — ${local.length} files in ${LOCAL_ROOT}/`);
  console.log(`  protected (never uploaded/pruned): ${[...PROTECTED].join(', ')}`);
  console.log(`  flags: dry-run=${DRY_RUN ? 'ON' : 'off'}  prune=${PRUNE ? 'ON' : 'off'}  force=${FORCE ? 'ON' : 'off'}`);

  const missing = ['FTP_HOST', 'FTP_USER', 'FTP_PASS', 'FTP_TEST_DIR'].filter((k) => !process.env[k]);
  if (missing.length) {
    const msg = `Missing FTP settings: ${missing.join(', ')} — set them in .env (see .env.example).`;
    if (DRY_RUN) {
      console.log(`\n(dry-run) ${msg}`);
      console.log('(dry-run) Cannot compare with remote without credentials. Local files that would be considered:');
      for (const f of local) {
        console.log(`  ${f.rel}`);
      }
      return;
    }
    console.error(`\n${msg}`);
    process.exit(1);
  }

  const { FTP_HOST, FTP_TEST_DIR } = process.env;

  // Safety: this FTP account also has write access to qa and prod. Refuse to run
  // unless the target path clearly points at the TEST site, so a mistyped
  // FTP_TEST_DIR (or a stray secret) can never deploy to — or --prune! — prod.
  if (!/(^|[/.])test([/.]|$)/i.test(FTP_TEST_DIR)) {
    console.error(`\nRefusing to run: FTP_TEST_DIR="${FTP_TEST_DIR}" does not look like the TEST target.`);
    console.error('This account can reach qa/prod too, so deploy-test only runs against a path containing "test".');
    process.exit(1);
  }

  console.log(`  target: ${FTP_HOST} ${FTP_TEST_DIR}\n`);

  const client = new ftp.Client();
  try {
    await client.access({ host: FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS, secure: false });
    await client.ensureDir(FTP_TEST_DIR);

    const remote = await listRemote(client, FTP_TEST_DIR);

    // Classify each local file against the remote copy.
    const newFiles = [];
    const changed = [];
    let unchanged = 0;
    for (const f of local) {
      const remoteSize = remote.get(f.rel);
      if (remoteSize === undefined) {
        newFiles.push(f);
      } else if (FORCE || remoteSize !== f.size) {
        changed.push({ ...f, remoteSize });
      } else {
        unchanged++;
      }
    }
    const toUpload = [...newFiles, ...changed];

    // Stale = remote files the build no longer produces (protected always kept).
    const localSet = new Set(local.map((f) => f.rel));
    const stale = [...remote.keys()].filter((rel) => !localSet.has(rel) && !PROTECTED.has(path.posix.basename(rel))).sort();

    console.log(`Compared with remote: ${newFiles.length} new, ${changed.length} changed, ${unchanged} unchanged, ${stale.length} stale.`);
    if (newFiles.length) {
      console.log('  NEW:');
      newFiles.forEach((f) => console.log(`    + ${f.rel}`));
    }
    if (changed.length) {
      console.log('  CHANGED:');
      changed.forEach((f) => console.log(`    ~ ${f.rel} (local ${humanBytes(f.size)}, remote ${humanBytes(f.remoteSize)})`));
    }
    if (stale.length) {
      console.log(`  STALE on remote${PRUNE ? ' — will be removed' : ' — run with --prune to remove'}:`);
      stale.forEach((rel) => console.log(`    - ${rel}`));
    }

    if (DRY_RUN) {
      console.log('\n(dry-run) No changes made.');
      return;
    }

    // Upload, grouped by remote directory so we ensureDir once per folder.
    const byDir = new Map();
    for (const f of toUpload) {
      const d = path.posix.dirname(f.rel);
      if (!byDir.has(d)) {
        byDir.set(d, []);
      }
      byDir.get(d).push(f);
    }
    let done = 0;
    for (const [d, files] of byDir) {
      const remoteDir = d === '.' ? FTP_TEST_DIR : `${FTP_TEST_DIR}/${d}`;
      await client.ensureDir(remoteDir);
      for (const f of files) {
        done++;
        console.log(`  [${done}/${toUpload.length}] ${f.rel}`);
        await client.uploadFrom(path.join(LOCAL_ROOT, f.rel), path.posix.basename(f.rel));
      }
    }
    console.log(toUpload.length ? `Uploaded ${toUpload.length} file(s).` : 'Nothing to upload — remote already up to date.');

    if (PRUNE) {
      for (const rel of stale) {
        console.log(`  removing ${rel}`);
        await client.remove(`${FTP_TEST_DIR}/${rel}`);
      }
      console.log(`Pruned ${stale.length} file(s).`);
    }

    console.log('\nTEST deploy complete.');
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(`\nDeploy failed: ${err.message}`);
  process.exit(1);
});
