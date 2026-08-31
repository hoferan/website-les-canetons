// tools/put-overlay.mjs
// Uploads the SERVER-OWNED overlay files that a deploy deliberately never
// touches: dist/overlay/<env>/.htaccess, plus robots.txt when the overlay
// emits one.
//
//   npm run put-overlay:test|qa|prod   [-- --dry-run]
//
// Why this is not part of tools/deploy/cli.mjs: there, .htaccess is a PROTECTED
// basename, and that protection is load-bearing — it is what stops a --relist
// run deleting server files the tool never placed. This tool uploads one or two
// named files and deletes nothing, which is what makes it safe to run in the
// seconds after a deploy, when the site is mid-cutover.
//
// It does NOT upload .htpasswd, even when the overlay contains one: that is
// credentials, and re-uploading it during a cutover window is a way to lock
// yourself out for no gain. It stays hand-placed, once per server — see
// staging/README.md.
//
// Exit codes: 0 ok, 1 failure, 2 refused by a guard.
import ftp from 'basic-ftp';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDotEnv } from './dotenv.mjs';
import { TARGETS, checkTargetDir } from './deploy/preflight.mjs';

// A refusal is a deliberate guard stop (exit 2), distinct from a genuine
// transport/auth/timeout failure (exit 1) — mirrors tools/deploy/cli.mjs's
// Refusal class.
class Refusal extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 2;
  }
}

export function parseArgs(argv) {
  const flags = { dryRun: false };
  let target = null;
  for (const a of argv) {
    if (a === '--dry-run') {
      flags.dryRun = true;
    } else if (a.startsWith('--')) {
      return { error: `Unknown flag: ${a}` };
    } else if (target) {
      return { error: `Unexpected argument: ${a}` };
    } else {
      target = a;
    }
  }
  if (!target || !TARGETS.includes(target)) {
    return { error: `Usage: npm run put-overlay:<${TARGETS.join('|')}> [-- --dry-run]` };
  }
  return { target, ...flags };
}

/**
 * True when the overlay's AuthUserFile still holds the build-time token, which
 * would 500 the whole environment.
 *
 * Matches the QUOTED DIRECTIVE form specifically. build-overlays.mjs
 * substitutes only `"__HTPASSWD_PATH__"` and deliberately leaves the bare token
 * in its explanatory NOTE comment, so matching the bare token would refuse
 * every correctly built test/qa overlay.
 */
export function hasUnsubstitutedAuthPath(text) {
  return /^\s*AuthUserFile\s+"__HTPASSWD_PATH__"/m.test(text);
}

/**
 * True only when the overlay carries BOTH halves of the cutover: the API
 * dispatch into Laravel and the SPA fallback. dist/ is git-ignored, so
 * dist/overlay/<env>/ can be weeks stale — a pre-cutover overlay would route
 * every /api/* request at the deleted front controller, which is exactly the
 * outage this tool exists to prevent. Checking for either rule alone is not
 * enough: a stale overlay can still contain "index.php" (the legacy redirect
 * target), so the fallback's presence is what actually distinguishes
 * "post-cutover" from "old front controller".
 */
export function hasPostCutoverRules(text) {
  return text.includes('api-laravel/public/index.php') && text.includes('index.html');
}

// .htaccess is required; robots.txt is uploaded only when the overlay emits one
// (test/qa do, prod does not now that app/ is deleted). .htpasswd is
// deliberately absent from this list — see the header.
const REQUIRED = '.htaccess';
const OPTIONAL = ['robots.txt'];

/**
 * What to upload from an overlay directory. `exists` is injected so this stays
 * a pure function.
 *
 * A missing .htaccess is an error rather than an empty upload: uploading
 * nothing and reporting success is exactly how a cutover silently fails to
 * happen.
 */
export function planOverlay(dir, exists) {
  if (!exists(`${dir}/${REQUIRED}`)) {
    return {
      error:
        `${dir}/${REQUIRED} not found. Run \`npm run build:overlay\` first ` +
        `(it regenerates dist/overlay/<env>/ from config/htaccess/site.htaccess).`,
    };
  }
  return { files: [REQUIRED, ...OPTIONAL.filter((f) => exists(`${dir}/${f}`))] };
}

/**
 * Where to save a backup of the live .htaccess before overwriting it.
 *
 * Deliberately OUTSIDE dist/overlay/<env>/: build-overlays.mjs does
 * `rmSync(outDir, { recursive: true, force: true })` at the top of every
 * `npm run build:overlay` run, which would silently destroy the only copy of
 * the live .htaccess the next time someone rebuilds the overlay — and the
 * whole rollback story depends on that file existing. dist/htaccess-backups/
 * is never touched by build-overlays.mjs or by Vite.
 *
 * A dry-run backup gets its own dist/htaccess-backups/dry-run/ subdirectory,
 * not just a distinct filename in the same directory: after a real cutover, a
 * later --dry-run would otherwise download the NEW .htaccess into the same
 * namespace and become the newest file there, so a human restoring "the most
 * recent backup" would restore the very file being rolled back from.
 *
 * Each call also gets its own timestamped file (colons and dots stripped so
 * the name is filesystem-safe on Windows too), so two real runs can never
 * collide either. `dryRun` and `now` are both parameters rather than read from
 * ambient state, so this stays pure and testable without depending on the
 * real clock or a hidden mode flag.
 */
export function backupFilePath(target, dryRun = false, now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const dir = dryRun ? 'dist/htaccess-backups/dry-run' : 'dist/htaccess-backups';
  return `${dir}/${target}-${timestamp}.htaccess`;
}

// A 550 reply covers BOTH "no such file" and "permission denied" (RFC 959
// does not distinguish them by code). Only the former means "nothing to back
// up" — the latter is a real problem on a server that DOES have a live
// .htaccess, and treating it as "new environment" would overwrite that file
// with no backup, defeating the one guarantee this function exists to give.
const NOT_FOUND_REPLY = /no such file|not found|cannot find/i;

/**
 * Back up the live .htaccess, then upload the overlay files.
 *
 * Returns `{ htaccessUploaded, backedUp }`, and attaches the same two fields
 * to any error it throws. This is deliberately NOT inferred by the caller
 * from the prose passed to `log` — a human-readable log line is not a machine
 * contract, and matching one is exactly the pattern
 * tools/build-overlays.test.mjs's "check directive LINES, not prose" comment
 * warns against. `main()` reads these fields to report, on failure, the one
 * thing an operator needs immediately in this window: did the routing already
 * flip?
 *
 * .htaccess is uploaded LAST. robots.txt landing early is harmless, but
 * .htaccess is the file that flips routing — so if a later step fails, this
 * function has only ever either fully turned .htaccess over or left it alone,
 * never half-written it. That is NOT the same as the site being fine either
 * way: during a cutover, "untouched" usually means "still broken", because a
 * deploy has already deleted the old app — so a robots.txt failure blocks the
 * one upload that fixes it.
 *
 * The backup is mandatory whenever there is something to back up. A rollback
 * needs both the old code artifact and the old server-owned .htaccess;
 * without this copy, redeploying an old tag leaves the site in exactly the
 * broken state this tool exists to resolve. A brand-new server has no live
 * .htaccess yet, though — a real, documented first-time-per-server operation —
 * so an FTP 550 whose reply text actually says "not found" is treated as
 * "nothing to back up" and this proceeds; any other backup failure (auth,
 * timeout, transport, or a 550 that means permission-denied) still refuses
 * hard, because then we genuinely cannot tell whether there was a file to
 * protect.
 *
 * After .htaccess itself is uploaded, its remote size is compared against the
 * local file's size and a mismatch throws: this host is known to truncate
 * transfers (see tools/deploy/ftp.mjs's verify phase), and an unverified
 * .htaccess is the one file that 500s the entire site if it lands short.
 * Skipped under --dry-run, since nothing was actually uploaded to verify.
 */
export async function putOverlay({ client, remoteRoot, localDir, files, backupPath, dryRun, log }) {
  let backedUp = false;
  let htaccessUploaded = false;

  try {
    await client.downloadTo(backupPath, `${remoteRoot}/.htaccess`);
    backedUp = true;
    log(`backed up the live .htaccess -> ${backupPath}`);
  } catch (err) {
    if (err.code === 550 && NOT_FOUND_REPLY.test(err.message)) {
      log(`no live .htaccess on the server — nothing to back up (new environment). Server said: ${err.message}`);
    } else {
      throw Object.assign(
        new Refusal(
          `could not back up the live .htaccess (${err.message}). ` +
            `Refusing to overwrite it without a copy to roll back to.`
        ),
        { htaccessUploaded, backedUp }
      );
    }
  }

  try {
    const ordered = [...files.filter((f) => f !== REQUIRED), REQUIRED];
    for (const name of ordered) {
      if (dryRun) {
        log(`(dry-run) would upload ${name}`);
        continue;
      }
      await client.uploadFrom(`${localDir}/${name}`, `${remoteRoot}/${name}`);
      log(`uploaded ${name}`);

      if (name === REQUIRED) {
        htaccessUploaded = true;
        const remoteSize = await client.size(`${remoteRoot}/${REQUIRED}`);
        const localSize = statSync(`${localDir}/${REQUIRED}`).size;
        if (remoteSize !== localSize) {
          throw new Error(
            `uploaded ${REQUIRED} size mismatch (local ${localSize} bytes, remote ${remoteSize} bytes) — ` +
              `this host is known to truncate transfers. The site may now be on a corrupt ${REQUIRED}. ` +
              `Restore ${backupPath} immediately.`
          );
        }
        log(`verified ${REQUIRED}: ${localSize} bytes match on the server`);
      }
    }
  } catch (err) {
    throw Object.assign(err, { htaccessUploaded, backedUp });
  }

  return { htaccessUploaded, backedUp };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { target, dryRun } = parsed;
  const label = target.toUpperCase();

  // Env-specific first, shared rest from .env — loadDotEnv never overwrites an
  // already-set var, so .env.<target> wins. Same order as the deploy CLI.
  loadDotEnv(`.env.${target}`);
  loadDotEnv('.env');
  const missing = ['FTP_HOST', 'FTP_USER', 'FTP_PASS', 'FTP_DIR'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `Missing FTP settings: ${missing.join(', ')} — set them in .env.${target}.\n` +
        `Note .env.* declare FTP_PASSWORD while the tooling reads FTP_PASS; that mismatch is ` +
        `deliberate (see CLAUDE.md). Inject it for a one-off run rather than editing the env file.`
    );
    process.exit(1);
  }
  const remoteRoot = process.env.FTP_DIR;

  // The one FTP account reaches every environment; refuse unless the target
  // path clearly names the intended env.
  const guard = checkTargetDir(target, remoteRoot);
  if (!guard.ok) {
    console.error(guard.message);
    process.exit(2);
  }

  const localDir = `dist/overlay/${target}`;
  const plan = planOverlay(localDir, existsSync);
  if (plan.error) {
    console.error(plan.error);
    process.exit(2);
  }

  const htaccess = readFileSync(`${localDir}/.htaccess`, 'utf8');
  if (hasUnsubstitutedAuthPath(htaccess)) {
    console.error(
      `${localDir}/.htaccess still has AuthUserFile "__HTPASSWD_PATH__". Uploading it would ` +
        `500 the whole ${label} site. Set HTPASSWD_PATH in .env.${target} and re-run ` +
        `\`npm run build:overlay ${target}\`.`
    );
    process.exit(2);
  }

  // dist/ is git-ignored, so this overlay can be arbitrarily stale — including
  // a pre-cutover build that would route every /api/* request at the deleted
  // front controller. Both halves of the cutover must be present.
  if (!hasPostCutoverRules(htaccess)) {
    console.error(
      `${localDir}/.htaccess does not look like a post-cutover overlay (missing the API dispatch to ` +
        `api-laravel/public/index.php and/or the SPA fallback to index.html). It may be stale — ` +
        `regenerate it with \`npm run build:overlay ${target}\` before uploading.`
    );
    process.exit(2);
  }

  const backupPath = backupFilePath(target, dryRun);
  mkdirSync(dirname(backupPath), { recursive: true });
  console.log(
    `PUT-OVERLAY ${target} → ${process.env.FTP_HOST} ${remoteRoot}${dryRun ? '  (dry-run)' : ''}`
  );
  console.log(`  files: ${plan.files.join(', ')}`);

  const client = new ftp.Client();
  let result;
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });
    result = await putOverlay({
      client,
      remoteRoot,
      localDir,
      files: plan.files,
      backupPath,
      dryRun,
      log: (m) => console.log(`  ${m}`),
    });
  } catch (err) {
    // Read structured state off the error rather than inferring it from log
    // prose — see putOverlay's docstring for why that distinction matters.
    const htaccessUploaded = err.htaccessUploaded ?? false;
    console.error(
      htaccessUploaded
        ? `\n${label}: FAILED after .htaccess was already uploaded — the site IS on the new ` +
            `routing. Previous .htaccess is backed up at ${backupPath}.`
        : `\n${label}: FAILED before .htaccess was uploaded — the site is UNCHANGED (still on its ` +
            `previous routing, which may itself be mid-cutover and broken). Backup of the previous ` +
            `.htaccess, if one existed, is at ${backupPath}.`
    );
    console.error(`\nput-overlay FAILED: ${err.message}`);
    process.exitCode = err.exitCode ?? 1;
    return;
  } finally {
    client.close();
  }

  // "Backed up" is only true when the server actually had a live .htaccess to
  // copy — a first-time-per-server upload legitimately takes none, and
  // naming a backupPath that was never written would send a rollback looking
  // for a file that does not exist.
  console.log(
    dryRun
      ? `\n(dry-run) ${label}: nothing uploaded.` +
          (result.backedUp
            ? ` Backup of the live .htaccess is at ${backupPath}.`
            : ' No live .htaccess existed to back up.')
      : result.backedUp
        ? `\n${label}: overlay in place. Previous .htaccess saved at ${backupPath} — keep it for rollback.`
        : `\n${label}: overlay in place. No live .htaccess existed to back up (new environment) — nothing to roll back to.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nput-overlay FAILED: ${err.message}`);
    process.exit(err.exitCode ?? 1);
  });
}
