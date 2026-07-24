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
// Credentials come from a git-ignored per-env .env.<target> (see .env.example —
// copy it to .env.test / .env.qa / .env.prod). The one FTP account can reach
// every environment, so each target hard-refuses to run unless its FTP_DIR
// matches the env name (see the guards below). Each deploy also writes a
// deployment.json marker into public/ recording the deployed commit.
//
// Pre-flight config check: config.php is server-owned and never touched by
// this script, so code that expects a new config key (e.g. a new App\Features
// flag) can ship here while the target's config.php is still missing it.
// Before uploading anything, the target's config.php is fetched and its key
// *shape* (not values — those are never logged) is compared against
// config/config.example.php, the source of truth for what the code expects.
// Any drift (missing OR extra keys) refuses the deploy with the exact key
// paths to fix; --dry-run reports the same drift without refusing. If
// config.php can't be fetched at all (e.g. a brand-new environment before
// initial setup), this only warns — the site can't run either way, deployed
// code or not, so blocking wouldn't add protection there.
import ftp from 'basic-ftp';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Engine from 'php-parser';
import { loadDotEnv } from './dotenv.mjs';

const LOCAL_ROOT = 'dist/build';

// Files that live on the server and must never be uploaded or pruned.
const PROTECTED = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd']);

// The deployment marker. Written into public/ on every deploy.
const MARKER = 'deployment.json';

// Files whose CONTENT can change while their byte SIZE stays identical, so the
// size-based change check below would wrongly treat them as "unchanged" and skip
// them. These MUST be re-uploaded every deploy:
//  - deployment.json: the commit SHA is a fixed length.
//  - Composer autoload glue (vendor/autoload.php + vendor/composer/*): the
//    autoloader suffix (ComposerAutoloaderInit<hash> / ComposerStaticInit<hash>)
//    changes whenever the dependency set / composer state changes, but is a
//    fixed 32-char length — so vendor/autoload.php and vendor/composer/*.php can
//    change content without changing size. A partial skip leaves autoload_real.php
//    referencing a ComposerStaticInit<hash> that the uploaded autoload_static.php
//    no longer defines -> fatal "class not found" on every page.
//  - Vite's build manifest (assets/dist/.vite/manifest.json, see App\Assets):
//    entry keys and Vite's default hash length are stable across ordinary
//    content edits, so an unrelated JS/CSS change routinely leaves the
//    manifest's byte size unchanged even though every hash inside it changed.
//    A skipped manifest means App\Assets keeps emitting the PREVIOUS deploy's
//    asset filenames — the new JS/CSS silently never reaches users (or, with
//    --prune removing the now-unreferenced old files, a live 404).
function alwaysUpload(rel) {
  return (
    rel === MARKER ||
    rel === 'vendor/autoload.php' ||
    rel.startsWith('vendor/composer/') ||
    rel === 'assets/dist/.vite/manifest.json'
  );
}

// First non-flag arg selects the target environment.
const TARGETS = {
  test: { dirVar: 'FTP_DIR', guard: /(^|[/.])test([/.]|$)/i },
  qa: { dirVar: 'FTP_DIR', guard: /(^|[/.])qa([/.]|$)/i },
  prod: { dirVar: 'FTP_DIR', guard: /(^|[/.])prod([/.]|$)/i },
};

// Parse CLI args (target + flags) at run time, not import time, so this module
// can be imported (e.g. by a test of configKeyPaths) without CLI side effects.
function parseArgs() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  if (!target || !TARGETS[target]) {
    console.error(`Usage: node tools/deploy.mjs <${Object.keys(TARGETS).join('|')}> [--dry-run] [--prune] [--force] [--no-verify]`);
    process.exit(1);
  }
  const { dirVar, guard } = TARGETS[target];
  return {
    target,
    DRY_RUN: args.includes('--dry-run'),
    PRUNE: args.includes('--prune'),
    FORCE: args.includes('--force'),
    NO_VERIFY: args.includes('--no-verify'),
    dirVar,
    guard,
    LABEL: target.toUpperCase(),
  };
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

// Compare the files uploaded this run against a fresh remote snapshot. Pure so
// it is unit-testable in isolation. `uploaded` is [{rel, size}]; `remoteSizes`
// is the Map<rel, size> from listRemote. Reports files that did not land
// (missing) or landed at the wrong byte count (mismatched = truncated/partial).
// Remote files not in `uploaded` are ignored — only this run's uploads are judged.
function diffSizes(uploaded, remoteSizes) {
  const missing = [];
  const mismatched = [];
  for (const f of uploaded) {
    const remote = remoteSizes.get(f.rel);
    if (remote === undefined) {
      missing.push(f.rel);
    } else if (remote !== f.size) {
      mismatched.push({ rel: f.rel, local: f.size, remote });
    }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

// Take a fresh remote snapshot (reusing listRemote — same LIST-based sizes the
// deploy already trusts, so no reliance on the FTP SIZE command) and compare the
// files we just uploaded against it.
async function verifyUpload(client, remoteRoot, uploaded) {
  const remoteSizes = await listRemote(client, remoteRoot);
  return diffSizes(uploaded, remoteSizes);
}

function humanBytes(n) {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

// Flattens a config.php array to a sorted list of dotted key paths (e.g.
// "db.host", "features.souper_signup") — never the values, so secrets never
// appear in deploy output. The file is *parsed* to an AST (php-parser) and its
// top-level `return [ ... ]` walked statically; it is never evaluated, so this
// needs no `php` binary and never executes the config.php we just fetched off
// the server. It assumes config.php is a plain literal array (as it always is —
// see config/config.example.php): array keys must be string/int literals. Any
// dynamic construct throws a clear error rather than silently under-reporting
// keys. (An empty nested array `[]` contributes no keys — matching how a
// recursive flatten drops a branch with nothing in it.)
const phpEngine = new Engine({ ast: { withPositions: false }, parser: { extractDoc: false } });

// Resolve an array-entry key node to its literal string form. PHP arrays index
// unkeyed entries by a running integer (max int key seen so far + 1, from 0),
// so we track that to stay faithful to how PHP would key a list-style array.
function literalKey(node, autoIndex) {
  if (node == null) {
    return { key: String(autoIndex.next), next: autoIndex.next + 1 };
  }
  if (node.kind === 'string') {
    return { key: String(node.value), next: autoIndex.next };
  }
  if (node.kind === 'number' && Number.isInteger(Number(node.value))) {
    const n = Number(node.value);
    return { key: String(n), next: Math.max(autoIndex.next, n + 1) };
  }
  throw new Error(`Unsupported config key: expected a string/int literal, got "${node.kind}".`);
}

// Recursively collect dotted key paths from a php-parser `array` node.
function arrayKeyPaths(arrayNode, prefix, out) {
  const autoIndex = { next: 0 };
  for (const item of arrayNode.items) {
    if (item.kind !== 'entry' || item.unpack) {
      throw new Error(`Unsupported config construct: "${item.unpack ? 'spread' : item.kind}" (expected a plain array entry).`);
    }
    const { key, next } = literalKey(item.key, autoIndex);
    autoIndex.next = next;
    const full = prefix === '' ? key : `${prefix}.${key}`;
    if (item.value && item.value.kind === 'array') {
      arrayKeyPaths(item.value, full, out); // empty array => contributes nothing
    } else {
      out.push(full);
    }
  }
  return out;
}

function configKeyPaths(phpFilePath) {
  const src = readFileSync(phpFilePath, 'utf8');
  const program = phpEngine.parseCode(src, phpFilePath);
  const ret = program.children.find((n) => n.kind === 'return');
  if (!ret || !ret.expr) {
    throw new Error(`${phpFilePath}: expected a top-level "return [ ... ];".`);
  }
  if (ret.expr.kind !== 'array') {
    throw new Error(`${phpFilePath}: top-level return is not an array literal — cannot read config key shape statically.`);
  }
  return arrayKeyPaths(ret.expr, '', []).sort();
}

// Pre-flight: compare the remote config.php's key *shape* (never its values)
// against config/config.example.php, the single source of truth for which
// keys the deployed code expects. A mismatch means a feature shipped in this
// deploy needs a config.php key that hasn't been set by hand on this server
// yet (or the reverse — the example is now stale) — either way, safer to
// refuse the deploy with a clear message than to let it silently misbehave.
// Best-effort: if config.php can't be fetched at all (e.g. a brand-new
// environment where it hasn't been placed yet), this only warns.
async function checkConfigShape(client, remoteRoot, label) {
  const exampleKeys = configKeyPaths('config/config.example.php');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-config-'));
  const tmpConfig = path.join(tmpDir, 'config.php');
  try {
    try {
      await client.downloadTo(tmpConfig, `${remoteRoot}/config.php`);
    } catch (err) {
      console.log(`  config shape: could not fetch ${label}'s config.php (${err.message}) — skipping check.`);
      return { ok: true, skipped: true };
    }

    const remoteKeys = configKeyPaths(tmpConfig);
    const remoteSet = new Set(remoteKeys);
    const exampleSet = new Set(exampleKeys);
    const missing = exampleKeys.filter((k) => !remoteSet.has(k));
    const extra = remoteKeys.filter((k) => !exampleSet.has(k));

    if (missing.length === 0 && extra.length === 0) {
      console.log(`  config shape: OK — ${label}'s config.php matches config.example.php.`);
      return { ok: true, skipped: false };
    }

    console.log(`  config shape: MISMATCH between ${label}'s config.php and config.example.php.`);
    if (missing.length) {
      console.log(`    missing on ${label} (add these keys to its config.php):`);
      missing.forEach((k) => console.log(`      - ${k}`));
    }
    if (extra.length) {
      console.log(`    extra on ${label} (not in config.example.php):`);
      extra.forEach((k) => console.log(`      - ${k}`));
    }
    return { ok: false, skipped: false, missing, extra };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Parse FTP_CONCURRENCY: default 6, clamped to 1..8 (stays under this host's
// ~10 concurrent-connection budget; =1 reproduces the old serial upload).
export function parseConcurrency(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 6;
  }
  return Math.min(8, Math.max(1, n));
}

// Directories that hold no surviving file once `stalePaths` are removed, given
// the full pre-prune remote file list `remoteFiles` (both posix rel-paths).
// Returned deepest-first so a parent is only removed after its children. Used
// for both the --dry-run prediction and to order real removeEmptyDir calls.
export function emptyDirsAfterPrune(stalePaths, remoteFiles) {
  const staleSet = new Set(stalePaths);
  const survivors = remoteFiles.filter((f) => !staleSet.has(f));
  const candidates = new Set();
  for (const rel of stalePaths) {
    let dir = path.posix.dirname(rel);
    while (dir && dir !== '.') {
      candidates.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  const empty = [...candidates].filter((dir) => !survivors.some((s) => s.startsWith(`${dir}/`)));
  empty.sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
  return empty;
}

// Run `worker(item, index)` across up to `concurrency` cooperating workers pulling
// from a shared cursor. Pure w.r.t. I/O (worker is injected). Fail-fast: the
// first worker rejection stops new items from starting and rejects the pool.
export async function runPool(items, concurrency, worker) {
  let next = 0;
  let failed = false;
  const runWorker = async () => {
    while (!failed) {
      const i = next++;
      if (i >= items.length) {
        return;
      }
      try {
        await worker(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const workers = Math.max(0, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
}

async function main() {
  const { target, DRY_RUN, PRUNE, FORCE, NO_VERIFY, dirVar, guard, LABEL } = parseArgs();

  if (!existsSync(LOCAL_ROOT)) {
    console.error(`No ${LOCAL_ROOT}/ found — run "npm run build" first.`);
    process.exit(1);
  }

  // Env-specific values (FTP dir, migrate token, site URL, htpasswd path) live
  // in .env.<target>; shared secrets (FTP host/user/pass) in .env. Load the
  // env-specific file first — loadDotEnv never overwrites an already-set var, so
  // env-specific wins and .env fills in the shared rest.
  loadDotEnv(`.env.${target}`);
  loadDotEnv('.env');
  const marker = writeDeploymentMarker(target);
  const local = walk(LOCAL_ROOT).sort((a, b) => a.rel.localeCompare(b.rel));
  console.log(`  marker: ${MARKER} @ ${marker.shortCommit} (${marker.deployedAt})`);

  console.log(`${LABEL} deploy — ${local.length} files in ${LOCAL_ROOT}/`);
  console.log(`  protected (never uploaded/pruned): ${[...PROTECTED].join(', ')}`);
  console.log(
    `  flags: dry-run=${DRY_RUN ? 'ON' : 'off'}  prune=${PRUNE ? 'ON' : 'off'}  force=${FORCE ? 'ON' : 'off'}  no-verify=${NO_VERIFY ? 'ON' : 'off'}`
  );

  const missing = ['FTP_HOST', 'FTP_USER', 'FTP_PASS', dirVar].filter((k) => !process.env[k]);
  if (missing.length) {
    const msg = `Missing FTP settings: ${missing.join(', ')} — set them in .env.${target} (copy .env.example).`;
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

    const shape = await checkConfigShape(client, remoteRoot, LABEL);
    if (!shape.ok) {
      if (DRY_RUN) {
        console.log('\n(dry-run) Would refuse to deploy: fix config.php on the server before the real deploy runs.');
      } else {
        throw new Error(
          `${LABEL}'s config.php has drifted from config.example.php — fix it by hand on the server, then re-run the deploy.`
        );
      }
    }

    const remote = await listRemote(client, remoteRoot);

    // Classify each local file against the remote copy.
    const newFiles = [];
    const changed = [];
    let unchanged = 0;
    for (const f of local) {
      const remoteSize = remote.get(f.rel);
      if (remoteSize === undefined) {
        newFiles.push(f);
      } else if (FORCE || alwaysUpload(f.rel) || remoteSize !== f.size) {
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
    const emptyDirs = PRUNE ? emptyDirsAfterPrune(stale, [...remote.keys()]) : [];
    if (stale.length) {
      console.log(`  STALE on remote${PRUNE ? ' — will be removed' : ' — run with --prune to remove'}:`);
      stale.forEach((rel) => console.log(`    - ${rel}`));
      if (PRUNE && emptyDirs.length) {
        console.log('  EMPTY DIRECTORIES after prune — will be removed:');
        emptyDirs.forEach((d) => console.log(`    - ${d}/`));
      }
    }

    if (DRY_RUN) {
      console.log('\n(dry-run) No changes made.');
      return;
    }

    // Upload, grouped by remote directory so each connection ensureDir's once
    // per folder. Parallelised across a small pool of connections: per-file FTP
    // round-trip latency — not bandwidth — dominates, so N connections give a
    // near-linear speedup. Every dir op uses an ABSOLUTE ${remoteRoot}/${dir}
    // path (ensureDir resets to root for absolute paths), so the independent
    // connections never clobber each other's working directory.
    const byDir = new Map();
    for (const f of toUpload) {
      const d = path.posix.dirname(f.rel);
      if (!byDir.has(d)) {
        byDir.set(d, []);
      }
      byDir.get(d).push(f);
    }
    const batches = [...byDir.entries()];
    const workers = Math.max(1, Math.min(parseConcurrency(process.env.FTP_CONCURRENCY), batches.length || 1));
    const accessOpts = { host: FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS, secure: false };

    if (toUpload.length) {
      const pool = [];
      const free = [];
      let done = 0;
      try {
        for (let i = 0; i < workers; i++) {
          const c = new ftp.Client();
          pool.push(c); // track before access() so a failed connection is still closed
          await c.access(accessOpts);
          free.push(c);
        }
        await runPool(batches, workers, async ([d, files]) => {
          const c = free.pop();
          try {
            const remoteDir = d === '.' ? remoteRoot : `${remoteRoot}/${d}`;
            await c.ensureDir(remoteDir);
            for (const f of files) {
              done++;
              console.log(`  [${done}/${toUpload.length}] ${f.rel}`);
              await c.uploadFrom(path.join(LOCAL_ROOT, f.rel), path.posix.basename(f.rel));
            }
          } finally {
            free.push(c);
          }
        });
      } finally {
        pool.forEach((c) => c.close());
      }
    }
    console.log(toUpload.length ? `Uploaded ${toUpload.length} file(s) (concurrency ${workers}).` : 'Nothing to upload — remote already up to date.');

    // The main client was idle throughout the (possibly long) parallel upload
    // on the pool connections above; a short host FTP idle-timeout could have
    // silently dropped it. Re-establish it before prune/verify so those don't
    // fail on a dead socket after a successful upload.
    if (toUpload.length) {
      await client.access(accessOpts);
    }

    if (PRUNE) {
      for (const rel of stale) {
        console.log(`  removing ${rel}`);
        await client.remove(`${remoteRoot}/${rel}`);
      }
      console.log(`Pruned ${stale.length} file(s).`);

      let removedDirs = 0;
      for (const d of emptyDirs) {
        try {
          await client.removeEmptyDir(`${remoteRoot}/${d}`);
          console.log(`  removing empty dir ${d}/`);
          removedDirs++;
        } catch {
          // RMD fails on a non-empty dir (a surviving file, or a PROTECTED file
          // like .htaccess kept on the server) — expected; skip it.
        }
      }
      if (removedDirs) {
        console.log(`Removed ${removedDirs} empty director${removedDirs === 1 ? 'y' : 'ies'}.`);
      }
    }

    // Post-deploy verification: confirm every file we uploaded landed on the
    // server at the right byte size. Skipped when bypassed or when nothing was
    // uploaded. A failure throws — caught by main().catch, which exits non-zero.
    if (NO_VERIFY) {
      console.log('\nSkipping post-deploy verification (--no-verify).');
    } else if (toUpload.length === 0) {
      console.log('\nNothing uploaded — skipping post-deploy verification.');
    } else {
      console.log(`\nVerifying ${toUpload.length} uploaded file(s) against the server...`);
      const result = await verifyUpload(client, remoteRoot, toUpload);
      if (result.ok) {
        console.log(`Verified ${toUpload.length} uploaded file(s) — server matches the build.`);
      } else {
        result.mismatched.forEach((m) =>
          console.log(`  MISMATCH ${m.rel} (local ${humanBytes(m.local)}, remote ${humanBytes(m.remote)})`)
        );
        result.missing.forEach((rel) => console.log(`  MISSING  ${rel}`));
        throw new Error(
          `verification FAILED — ${result.missing.length} missing, ${result.mismatched.length} truncated. ` +
            `The upload completed but the server copy doesn't match the build. Re-run the deploy ` +
            `(or investigate the FTP connection) before trusting this environment.`
        );
      }
    }

    console.log(`\n${LABEL} deploy complete.`);
  } finally {
    client.close();
  }
}

// Run only when invoked directly (node tools/deploy.mjs ...), not when imported
// (e.g. by a test exercising configKeyPaths in isolation).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nDeploy failed: ${err.message}`);
    process.exit(1);
  });
}

export { configKeyPaths, diffSizes };
