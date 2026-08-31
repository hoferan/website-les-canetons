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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDotEnv } from './dotenv.mjs';
import { TARGETS, checkTargetDir } from './deploy/preflight.mjs';

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
 * Each call gets its own timestamped file (colons and dots stripped so the
 * name is filesystem-safe on Windows too), so a --dry-run run can never
 * clobber a real cutover's backup. `now` is injected so this stays pure and
 * testable without depending on the real clock.
 */
export function backupFilePath(target, now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `dist/htaccess-backups/${target}-${timestamp}.htaccess`;
}

/**
 * Back up the live .htaccess, then upload the overlay files.
 *
 * .htaccess is uploaded LAST. robots.txt landing early is harmless, but
 * .htaccess is the file that flips routing — so if anything fails, the site is
 * either fully turned over or untouched, never mid-swap.
 *
 * The backup is mandatory. A rollback needs both the old code artifact and the
 * old server-owned .htaccess; without this copy, redeploying an old tag leaves
 * the site in exactly the broken state this tool exists to resolve.
 */
export async function putOverlay({ client, remoteRoot, localDir, files, backupPath, dryRun, log }) {
  try {
    await client.downloadTo(backupPath, `${remoteRoot}/.htaccess`);
    log(`backed up the live .htaccess -> ${backupPath}`);
  } catch (err) {
    throw new Error(
      `could not back up the live .htaccess (${err.message}). ` +
        `Refusing to overwrite it without a copy to roll back to.`
    );
  }

  const ordered = [...files.filter((f) => f !== REQUIRED), REQUIRED];
  for (const name of ordered) {
    if (dryRun) {
      log(`(dry-run) would upload ${name}`);
      continue;
    }
    await client.uploadFrom(`${localDir}/${name}`, `${remoteRoot}/${name}`);
    log(`uploaded ${name}`);
  }
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
  const plan = planOverlay(localDir, (p) => existsSync(p));
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

  const backupPath = backupFilePath(target);
  mkdirSync(dirname(backupPath), { recursive: true });
  console.log(
    `PUT-OVERLAY ${target} → ${process.env.FTP_HOST} ${remoteRoot}${dryRun ? '  (dry-run)' : ''}`
  );
  console.log(`  files: ${plan.files.join(', ')}`);

  const client = new ftp.Client();
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });
    await putOverlay({
      client,
      remoteRoot,
      localDir,
      files: plan.files,
      backupPath,
      dryRun,
      log: (m) => console.log(`  ${m}`),
    });
  } finally {
    client.close();
  }

  console.log(
    dryRun
      ? `\n(dry-run) ${label}: nothing uploaded. Backup of the live .htaccess is at ${backupPath}.`
      : `\n${label}: overlay in place. Previous .htaccess saved at ${backupPath} — keep it for rollback.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nput-overlay FAILED: ${err.message}`);
    process.exit(1);
  });
}
