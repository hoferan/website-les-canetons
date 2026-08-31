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
