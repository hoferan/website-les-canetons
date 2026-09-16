// tools/composer-websession.mjs
// Removes the static-analysis packages from api/composer.json and
// api/composer.lock, so a Claude Code web session does not install them.
//
//   node tools/composer-websession.mjs <path-to-api-directory>
//
// BOTH FILES, and that is not belt-and-braces. `composer install` validates the
// manifest against the lock and refuses outright when they disagree:
//
//   - Required (in require-dev) package "larastan/larastan" is not present in
//     the lock file.
//
// MEASURED 2026-09-16: patching only the lock fails in 0.7s with exactly that,
// leaving no vendor at all. The test suite checks both halves against the real
// project for that reason.
//
// Prints one line per removed package and exits 0 whether or not anything was
// removed. Used by tools/ensure-dev-stack.sh, which patches both files,
// installs, and restores both through a trap — neither edit may ever be
// committed.
//
// WHY. In a web session every dist download 403s (the session's GitHub proxy
// scopes the GitHub API to attached repositories only), so the install runs
// from git sources — see docs/web-session.md §1. That turns each package from a
// ~200 KB zipball into a full-history clone, and one package dominates
// completely:
//
//   phpstan/phpstan mirror   2.9 GB      MEASURED 2026-09-16
//   everything else, total   ~0.6 GB
//
// phpstan/phpstan is the distribution repo: every release commits a compiled
// phar, and binaries do not delta-compress between versions. 857 releases of
// that is the gigabytes and most of the minutes — for a tool that this project
// only ever runs through `npm run lint:types`, which CI's lint-api job already
// runs on every pull request.
//
// So a web session skips it, and CI is the gate. Removing rather than
// tolerating is deliberate: leaving it in the lock means cloning it.
//
// WHY THESE TWO NAMES. This repo never requires phpstan directly — larastan
// pulls it in. Only larastan hard-requires phpstan, and nothing hard-requires
// larastan, so removing the pair leaves a set Composer can install. The test
// checks that invariant against the real lock, because the day some new dev
// tool hard-requires either name, provisioning breaks here and nowhere else.
//
// Two invariants make patching a lock safe at all:
//
//   - `content-hash` is computed from composer.json, NOT from the package
//     entries, so removing an entry cannot invalidate it. Composer prints its
//     "lock file is not up to date" notice either way, because the committed
//     lock already predates a composer.json edit.
//   - `packages` — the runtime tree the API boots from and the suite runs
//     against — is never touched. Only `packages-dev`.
//
// This file replaced tools/composer-lock-git-sources.mjs, which derived a git
// `source` for the one dist-only package. That package was phpstan/phpstan, so
// not installing it retires the derivation entirely.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Static analysis: gated by CI's lint-api job, not installed in a web session. */
export const OMITTED = ['larastan/larastan', 'phpstan/phpstan'];

/**
 * Drops `names` from a parsed lock's dev packages, in place, and returns what
 * it dropped so a caller can report it.
 */
export function removePackages(lock, names = OMITTED) {
  const dev = lock['packages-dev'];
  if (!Array.isArray(dev)) return [];

  const removed = [];
  lock['packages-dev'] = dev.filter((pkg) => {
    if (!names.includes(pkg.name)) return true;
    removed.push(pkg.name);
    return false;
  });

  return removed;
}

/**
 * Drops `names` from a parsed composer.json's require-dev, in place, and
 * returns what it dropped. The production `require` block is never touched.
 */
export function removeDevRequires(manifest, names = OMITTED) {
  const dev = manifest['require-dev'];
  if (!dev || typeof dev !== 'object') return [];

  const unrequired = [];
  for (const name of names) {
    if (name in dev) {
      delete dev[name];
      unrequired.push(name);
    }
  }

  return unrequired;
}

/**
 * Patches an api/ directory's composer.json and composer.lock in place.
 *
 * Composer writes both with 4-space indentation and a trailing newline;
 * matching that keeps the diff to the lines actually removed, which matters
 * when a human looks at what this did. Neither file is rewritten when it had
 * nothing to lose.
 */
export function patchProject(dir, names = OMITTED) {
  const manifestPath = join(dir, 'composer.json');
  const lockPath = join(dir, 'composer.lock');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const unrequired = removeDevRequires(manifest, names);
  if (unrequired.length > 0) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const removed = removePackages(lock, names);
  if (removed.length > 0) writeFileSync(lockPath, `${JSON.stringify(lock, null, 4)}\n`);

  return { unrequired, removed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node tools/composer-websession.mjs <path-to-api-directory>');
    process.exit(1);
  }

  for (const name of patchProject(dir).removed) {
    console.log(`    omitted ${name} (static analysis runs in CI)`);
  }
}
