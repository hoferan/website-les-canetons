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
import { TARGETS } from './deploy/preflight.mjs';

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
