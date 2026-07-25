// tools/deploy/cli.mjs
// Deploy CLI: build + MIRROR the code artifact (dist/build/) to an environment
// over plain FTP. Pipeline: build → preflight → scan → remote state → plan →
// upload → delete stale → verify → finalize. All printing goes through ui.mjs,
// all FTP through ftp.mjs, all diff decisions through sync.mjs (pure).
//
//   npm run deploy:test|qa|prod             full sync (upload + delete + verify)
//   npm run status:test|qa|prod             build-free: what's deployed?
//   flags (append after --): --dry-run --force --force-delete --relist
//                            --no-delete --verbose
//
// Exit codes: 0 ok, 1 failure, 2 refused by a guard or the safety brake.
import ftp from 'basic-ftp';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadDotEnv } from '../dotenv.mjs';
import { createUI, humanBytes, fmtDuration } from './ui.mjs';
import { parseConcurrency, classify, classifyWithList, brakeTrips, emptyDirsAfterDelete } from './sync.mjs';
import { withRetry, listRemote, uploadFiles, deleteFiles, sweepEmptyDirs, verifyUploaded } from './ftp.mjs';
import { STATE_FILE, buildState, downloadState, uploadState } from './state.mjs';
import { walkBuild, fingerprint, writeDeploymentMarker } from './local.mjs';
import { PROTECTED, TARGETS, checkTargetDir, checkConfigShape } from './preflight.mjs';

const LOCAL_ROOT = 'dist/build';

// A refusal is a deliberate guard/brake stop (exit 2), distinct from a failure.
class Refusal extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
    this.exitCode = 2;
  }
}

export function parseArgs(argv) {
  const known = {
    '--dry-run': 'dryRun',
    '--force': 'force',
    '--force-delete': 'forceDelete',
    '--relist': 'relist',
    '--no-delete': 'noDelete',
    '--verbose': 'verbose',
    '--status': 'status',
  };
  const flags = { dryRun: false, force: false, forceDelete: false, relist: false, noDelete: false, verbose: false, status: false };
  let target = null;
  for (const a of argv) {
    if (a in known) {
      flags[known[a]] = true;
    } else if (a.startsWith('--')) {
      return { error: `Unknown flag: ${a}` };
    } else if (target) {
      return { error: `Unexpected argument: ${a}` };
    } else {
      target = a;
    }
  }
  if (!target || !TARGETS.includes(target)) {
    return {
      error: `Usage: npm run deploy:<${TARGETS.join('|')}> [-- --dry-run --force --force-delete --relist --no-delete --verbose]`,
    };
  }
  return { target, ...flags };
}

// Spawn the build (node tools/build.mjs) with output captured: a healthy
// build is one quiet step; the log streams through `onOutput` (shown only
// with --verbose) and is included in the error on failure.
function runBuild(onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/build.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const collect = (chunk) => {
      log += chunk;
      onOutput(chunk.toString());
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(log);
      } else {
        reject(new Error(`build failed (exit ${code}):\n${log}`));
      }
    });
  });
}

// Build-free status: read the state file header and print one line.
async function runStatus(target, accessOpts, remoteRoot) {
  const client = new ftp.Client();
  try {
    await client.access(accessOpts);
    const state = await downloadState(client, remoteRoot, accessOpts);
    if (!state) {
      console.log(`${target.toUpperCase()}: no ${STATE_FILE} on the server yet — the first deploy will bootstrap it.`);
      return;
    }
    const count = Object.keys(state.files || {}).length;
    console.log(
      `${target.toUpperCase()}: commit ${state.commit ?? '?'} — ${count} files — status ${state.status} — updated ${state.updatedAt}`
    );
  } finally {
    client.close();
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { target, dryRun, force, forceDelete, relist, noDelete, verbose, status } = parsed;
  const label = target.toUpperCase();

  // Env-specific values first (.env.<target>), shared rest from .env —
  // loadDotEnv never overwrites already-set vars, so env-specific wins.
  loadDotEnv(`.env.${target}`);
  loadDotEnv('.env');
  const missing = ['FTP_HOST', 'FTP_USER', 'FTP_PASS', 'FTP_DIR'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing FTP settings: ${missing.join(', ')} — set them in .env.${target} (copy .env.example).`);
    process.exit(1);
  }
  const remoteRoot = process.env.FTP_DIR;

  // Safety: the one FTP account reaches every environment; refuse unless the
  // target path clearly names the intended env.
  const guard = checkTargetDir(target, remoteRoot);
  if (!guard.ok) {
    console.error(guard.message);
    process.exit(2);
  }

  const accessOpts = { host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS, secure: false };
  const concurrency = parseConcurrency(process.env.FTP_CONCURRENCY);

  if (status) {
    await runStatus(target, accessOpts, remoteRoot);
    return;
  }

  const startedAt = Date.now();
  const ui = createUI({ verbose: verbose || dryRun });
  ui.info(`DEPLOY ${target} → ${process.env.FTP_HOST} ${remoteRoot}${dryRun ? '  (dry-run)' : ''}`);
  ui.plan([
    { id: 'build', title: 'Build' },
    { id: 'preflight', title: 'Preflight' },
    { id: 'scan', title: 'Scan' },
    { id: 'state', title: 'Remote state' },
    { id: 'plan', title: 'Plan' },
    { id: 'upload', title: 'Upload' },
    { id: 'delete', title: 'Delete stale' },
    { id: 'verify', title: 'Verify' },
    { id: 'finalize', title: 'Finalize' },
  ]);

  // Hoisted so the catch below can flush an in-flight checkpoint before the
  // finally closes the client (else a killed checkpoint can truncate the
  // remote state file — self-healing via bootstrap, but loses the resume).
  let checkpointChain = Promise.resolve();

  const client = new ftp.Client();
  try {
    // --- Build ------------------------------------------------------------
    ui.start('build');
    await runBuild((text) => text.split(/\r?\n/).filter(Boolean).forEach((l) => ui.detail(l)));
    if (!existsSync(LOCAL_ROOT)) {
      throw new Error(`build produced no ${LOCAL_ROOT}/`);
    }
    const marker = writeDeploymentMarker(target, LOCAL_ROOT);
    ui.done('build', `${LOCAL_ROOT}/ @ ${marker.shortCommit}`);

    // --- Preflight ----------------------------------------------------------
    ui.start('preflight');
    await client.access(accessOpts);
    await client.ensureDir(remoteRoot);
    const shape = await checkConfigShape(client, remoteRoot);
    if (shape.skipped) {
      ui.done('preflight', `guards OK · config.php not fetchable — check skipped (${shape.reason})`);
    } else if (shape.ok) {
      ui.done('preflight', 'guards OK · config shape OK');
    } else {
      shape.missing.forEach((k) => ui.info(`    config.php on ${label} is MISSING key: ${k}`));
      shape.extra.forEach((k) => ui.info(`    config.php on ${label} has EXTRA key:  ${k}`));
      if (dryRun) {
        ui.done('preflight', `config shape MISMATCH (${shape.missing.length} missing, ${shape.extra.length} extra) — dry-run reports only`);
      } else {
        throw new Refusal(
          `${label}'s config.php has drifted from config.example.php (${shape.missing.length} missing, ${shape.extra.length} extra keys — listed above).`,
          'Fix config.php by hand on the server, then re-run the deploy.'
        );
      }
    }

    // --- Scan ---------------------------------------------------------------
    ui.start('scan');
    const files = walkBuild(LOCAL_ROOT, PROTECTED);
    const localEntries = fingerprint(LOCAL_ROOT, files, (done, total) => ui.progress('scan', { done, total }));
    ui.done('scan', `${files.length} files hashed`);

    // --- Remote state ---------------------------------------------------------
    ui.start('state');
    const remoteState = await downloadState(client, remoteRoot, accessOpts);
    const authoritative = relist || !remoteState;
    let remoteSizes = null;
    let remoteDirs = [];
    if (authoritative) {
      const why = relist ? '--relist' : `no ${STATE_FILE} yet (bootstrap)`;
      const listed = await listRemote(remoteRoot, accessOpts, concurrency, (n) =>
        ui.progress('state', { note: `full LIST (${why}): ${n} directories walked` })
      );
      remoteSizes = listed.files;
      remoteDirs = listed.dirs;
      ui.done('state', `full LIST (${why}): ${remoteSizes.size} files in ${remoteDirs.length} dirs`);
    } else {
      ui.done('state', `${STATE_FILE} @ ${remoteState.commit ?? '?'} (${Object.keys(remoteState.files).length} files)`);
    }

    // --- Plan -----------------------------------------------------------------
    ui.start('plan');
    let { newFiles, changed, unchanged, stale } = authoritative
      ? classifyWithList(localEntries, remoteSizes, remoteState?.files, PROTECTED)
      : classify(localEntries, remoteState.files, PROTECTED);
    if (force) {
      changed = [...localEntries].map(([rel, e]) => ({ rel, size: e.size }));
      newFiles = [];
      unchanged = 0;
    }
    const toUpload = [...newFiles, ...changed];
    const deletions = noDelete ? [] : stale;
    const remoteCount = authoritative ? remoteSizes.size : Object.keys(remoteState.files).length;

    newFiles.forEach((f) => ui.detail(`+ ${f.rel}`));
    changed.forEach((f) => ui.detail(`~ ${f.rel}`));
    stale.forEach((rel) => ui.detail(`- ${rel}${noDelete ? '  (kept: --no-delete)' : ''}`));

    const planNote = `${newFiles.length} new, ${changed.length} changed, ${unchanged} unchanged, ${stale.length} stale`;
    const brake = deletions.length > 0 && brakeTrips(deletions.length, remoteCount) && !forceDelete;
    if (brake && !dryRun) {
      stale.forEach((rel) => ui.info(`    would delete: ${rel}`));
      throw new Refusal(
        `safety brake: this deploy would delete ${deletions.length} of ${remoteCount} remote files (>50 and >20%).`,
        'Check the deletion list above. If intended, re-run with --force-delete; otherwise investigate the build.'
      );
    }
    ui.done('plan', planNote + (brake ? ' — BRAKE would trip (--force-delete needed)' : ''));

    if (dryRun) {
      ['upload', 'delete', 'verify', 'finalize'].forEach((id) => ui.skip(id, 'dry-run'));
      ui.summary(`(dry-run) ${label}: ${planNote}${noDelete ? ', deletions disabled (--no-delete)' : ''}. No changes made.`);
      return;
    }

    // --- Upload -----------------------------------------------------------------
    ui.start('upload');
    // Track what's confirmed on the server this run: unchanged files are
    // already correct; uploaded files are added as they land. Drives the
    // resumable in-progress checkpoints of the state file.
    const toUploadSet = new Set(toUpload.map((f) => f.rel));
    const confirmed = new Map();
    for (const [rel, e] of localEntries) {
      if (!toUploadSet.has(rel)) {
        confirmed.set(rel, e);
      }
    }
    let uploadedCount = 0;
    let uploadedBytes = 0;
    const uploadStart = Date.now();
    // Throttled, serialized, best-effort checkpoint: a checkpoint failure
    // never fails the deploy (the final write is what counts); it just makes
    // a future resume redo a little more. Runs on the (otherwise idle) main
    // client while the upload pool works.
    const CHECKPOINT_EVERY = 1000;
    let sinceCheckpoint = 0;
    const onUploaded = (rel, size) => {
      confirmed.set(rel, localEntries.get(rel));
      uploadedCount++;
      uploadedBytes += size;
      const rate = uploadedBytes / Math.max(0.001, (Date.now() - uploadStart) / 1000);
      ui.progress('upload', { done: uploadedCount, total: toUpload.length, extra: `${humanBytes(rate)}/s` });
      if (++sinceCheckpoint >= CHECKPOINT_EVERY) {
        sinceCheckpoint = 0;
        const snapshot = buildState(target, marker.shortCommit, confirmed, 'in-progress');
        checkpointChain = checkpointChain
          .then(() => uploadState(client, remoteRoot, accessOpts, snapshot))
          .catch(() => {});
      }
    };
    if (toUpload.length) {
      // Mark the state in-progress before uploads begin, so an abort is
      // recognizable and a resume has a checkpoint to build on.
      await uploadState(client, remoteRoot, accessOpts, buildState(target, marker.shortCommit, confirmed, 'in-progress'));
      await uploadFiles(toUpload, LOCAL_ROOT, remoteRoot, accessOpts, Math.min(concurrency, toUpload.length), onUploaded);
      await checkpointChain; // flush any in-flight checkpoint before reusing the main client
      // The main client sat idle during the (possibly long) parallel upload;
      // the host may have dropped it. Re-establish before delete/verify/finalize.
      await withRetry(() => client.access(accessOpts), () => {});
      ui.done('upload', `${toUpload.length} files (${humanBytes(uploadedBytes)})`);
    } else {
      ui.done('upload', 'nothing to upload — remote already up to date');
    }

    // --- Delete stale --------------------------------------------------------------
    let deletedFiles = 0;
    let removedDirs = 0;
    if (noDelete) {
      ui.skip('delete', `--no-delete — ${stale.length} stale file(s) left on the server`);
    } else if (deletions.length === 0) {
      ui.done('delete', 'nothing stale');
    } else {
      ui.start('delete');
      deletedFiles = await deleteFiles(deletions, remoteRoot, accessOpts, concurrency, (n) =>
        ui.progress('delete', { done: n, total: deletions.length })
      );
      // Sweep directories left empty, deepest-first (children before parents —
      // FTP can only RMD an EMPTY dir, so an empty subtree collapses
      // inside-out). Authoritative runs know every real dir (empties
      // included); the fast path derives candidates from the state file.
      const sweepDirs = authoritative ? remoteDirs : emptyDirsAfterDelete(deletions, Object.keys(remoteState.files));
      removedDirs = await sweepEmptyDirs(sweepDirs, remoteRoot, accessOpts, client, (attempted, removed) =>
        ui.progress('delete', { note: `sweeping dirs ${attempted}/${sweepDirs.length} (${removed} removed)` })
      );
      ui.done('delete', `${deletedFiles} files deleted, ${removedDirs} empty dirs removed`);
    }

    // --- Verify -----------------------------------------------------------------
    if (toUpload.length === 0) {
      ui.skip('verify', 'nothing uploaded');
    } else {
      ui.start('verify');
      const result = await verifyUploaded(remoteRoot, accessOpts, concurrency, toUpload);
      if (!result.ok) {
        result.missing.forEach((rel) => ui.info(`    MISSING   ${rel}`));
        result.mismatched.forEach((m) =>
          ui.info(`    TRUNCATED ${m.rel} (local ${humanBytes(m.local)}, remote ${humanBytes(m.remote)})`)
        );
        throw new Error(
          `verification failed — ${result.missing.length} missing, ${result.mismatched.length} truncated (listed above). ` +
            `State file left in-progress; re-run the deploy — resume re-sends only the shortfall.`
        );
      }
      ui.done('verify', `${toUpload.length} uploads match the server`);
    }

    // --- Finalize -----------------------------------------------------------------
    ui.start('finalize');
    await uploadState(client, remoteRoot, accessOpts, buildState(target, marker.shortCommit, localEntries, 'complete'));
    ui.done('finalize', `${STATE_FILE} @ ${marker.shortCommit} (${localEntries.size} files)`);

    ui.summary(
      `${label} deploy done in ${fmtDuration(Date.now() - startedAt)} — ` +
        `${toUpload.length} uploaded, ${deletedFiles} deleted, ${removedDirs} dirs removed, ${unchanged} unchanged.`
    );
  } catch (err) {
    await checkpointChain.catch(() => {}); // flush any in-flight checkpoint before close
    ui.failActive(err.message, err.hint);
    process.exitCode = err.exitCode ?? 1;
  } finally {
    ui.close();
    client.close();
  }
}

// Run only when invoked directly (node tools/deploy/cli.mjs ...), not when
// imported (e.g. by cli.test.mjs exercising parseArgs).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nDeploy failed: ${err.message}`);
    process.exit(err.exitCode ?? 1);
  });
}
