// Deploys the built code artifact (public/) to a staging server (TEST or QA) over
// plain FTP. Uploads only new/changed files — "changed" = a different byte size
// on the server (FTP timestamps are unreliable on this host, so we don't trust
// them). Use --force to re-upload everything (needed for the rare edit that
// keeps a file's size identical). With --prune it also removes remote files the
// build no longer produces. The server-owned files
// (.htaccess, robots.txt, config.php, .htpasswd) are NEVER uploaded and NEVER
// pruned, so a deploy can't clobber the access-control overlay or DB config.
//
//   npm run deploy:test               # upload new/changed files to TEST
//   npm run deploy:qa                 # upload new/changed files to QA
//   npm run deploy:prod               # upload new/changed files to PROD
//   node tools/deploy.mjs <target> -- --dry-run  # show the plan, change nothing
//   node tools/deploy.mjs <target> -- --prune    # also delete remote files not in public/
//   node tools/deploy.mjs <target> -- --force    # re-upload every file, even unchanged ones
//
// Credentials come from a git-ignored .env (see .env.example). The one FTP
// account can reach every environment, so each target hard-refuses to run unless
// its FTP_*_DIR matches the env name (see the guards below). Each deploy also
// writes a deployment.json marker into public/ recording the deployed commit.
import ftp from 'basic-ftp';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadDotEnv } from './dotenv.mjs';

const LOCAL_ROOT = 'public';

// Files that live on the server and must never be uploaded or pruned.
const PROTECTED = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd']);

// The deployment marker. Written into public/ on every deploy and always
// re-uploaded (a commit SHA is a fixed length, so the size-based change check
// below would otherwise treat it as "unchanged" and skip it forever).
const MARKER = 'deployment.json';
const ALWAYS_UPLOAD = new Set([MARKER]);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PRUNE = args.includes('--prune');
const FORCE = args.includes('--force');

// First non-flag arg selects the target environment.
const TARGETS = {
  test: { dirVar: 'FTP_TEST_DIR', guard: /(^|[/.])test([/.]|$)/i },
  qa: { dirVar: 'FTP_QA_DIR', guard: /(^|[/.])qa([/.]|$)/i },
  prod: { dirVar: 'FTP_PROD_DIR', guard: /(^|[/.])prod([/.]|$)/i },
};
const target = args.find((a) => !a.startsWith('--'));
if (!target || !TARGETS[target]) {
  console.error(`Usage: node tools/deploy.mjs <${Object.keys(TARGETS).join('|')}> [--dry-run] [--prune] [--force]`);
  process.exit(1);
}
const { dirVar, guard } = TARGETS[target];
const LABEL = target.toUpperCase();

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

// Write a deployment marker into public/ so each server's root records exactly
// which commit is deployed there. Values come from GitHub Actions env vars when
// running in CI, falling back to local git for hand-runs.
function writeDeploymentMarker(env) {
  const gitOr = (fallback, ...gitArgs) => {
    try {
      return execFileSync('git', gitArgs, { encoding: 'utf8' }).trim();
    } catch {
      return fallback;
    }
  };
  const commit = process.env.GITHUB_SHA || gitOr('local', 'rev-parse', 'HEAD');
  const shortCommit = process.env.GITHUB_SHA
    ? process.env.GITHUB_SHA.slice(0, 7)
    : gitOr('local', 'rev-parse', '--short', 'HEAD');
  const ref = process.env.GITHUB_REF_NAME || gitOr('', 'rev-parse', '--abbrev-ref', 'HEAD');
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const runUrl =
    GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : null;
  const marker = { environment: env, commit, shortCommit, ref, deployedAt: new Date().toISOString(), runUrl };
  writeFileSync(path.join(LOCAL_ROOT, MARKER), `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
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
  const marker = writeDeploymentMarker(target);
  const local = walk(LOCAL_ROOT).sort((a, b) => a.rel.localeCompare(b.rel));
  console.log(`  marker: ${MARKER} @ ${marker.shortCommit} (${marker.deployedAt})`);

  console.log(`${LABEL} deploy — ${local.length} files in ${LOCAL_ROOT}/`);
  console.log(`  protected (never uploaded/pruned): ${[...PROTECTED].join(', ')}`);
  console.log(`  flags: dry-run=${DRY_RUN ? 'ON' : 'off'}  prune=${PRUNE ? 'ON' : 'off'}  force=${FORCE ? 'ON' : 'off'}`);

  const missing = ['FTP_HOST', 'FTP_USER', 'FTP_PASS', dirVar].filter((k) => !process.env[k]);
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

  const { FTP_HOST } = process.env;
  const remoteRoot = process.env[dirVar];

  // Safety: this FTP account can also write qa and prod. Refuse unless the
  // target path clearly points at the intended env, so a mistyped dir can never
  // deploy to — or --prune! — the wrong environment.
  if (!guard.test(remoteRoot)) {
    console.error(`\nRefusing to run: ${dirVar}="${remoteRoot}" does not look like the ${LABEL} target.`);
    console.error(`This account can reach other environments too, so deploy only runs against a path matching "${target}".`);
    process.exit(1);
  }

  console.log(`  target: ${FTP_HOST} ${remoteRoot}\n`);

  const client = new ftp.Client();
  try {
    await client.access({ host: FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS, secure: false });
    await client.ensureDir(remoteRoot);

    const remote = await listRemote(client, remoteRoot);

    // Classify each local file against the remote copy.
    const newFiles = [];
    const changed = [];
    let unchanged = 0;
    for (const f of local) {
      const remoteSize = remote.get(f.rel);
      if (remoteSize === undefined) {
        newFiles.push(f);
      } else if (FORCE || ALWAYS_UPLOAD.has(f.rel) || remoteSize !== f.size) {
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
      const remoteDir = d === '.' ? remoteRoot : `${remoteRoot}/${d}`;
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
        await client.remove(`${remoteRoot}/${rel}`);
      }
      console.log(`Pruned ${stale.length} file(s).`);
    }

    console.log(`\n${LABEL} deploy complete.`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(`\nDeploy failed: ${err.message}`);
  process.exit(1);
});
