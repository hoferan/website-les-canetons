// tools/composer-lock-git-sources.mjs
// Gives every dist-only package in api/composer.lock a git `source`, so
// `composer install --prefer-source` can clone it.
//
//   node tools/composer-lock-git-sources.mjs <path-to-composer.lock>
//
// Prints one line per patched package and exits 0 whether or not anything
// needed patching. Used by tools/ensure-dev-stack.sh, which patches a COPY of
// the lock, installs, and restores the original — the committed lock must never
// carry this.
//
// WHY THIS EXISTS, and it is not the reason docs/web-session.md gave until
// 2026-09-15. In a Claude Code web session, GitHub's API is reachable only for
// repositories ATTACHED to the session; everything else answers 403 with
// "GitHub access to this repository is not enabled for this session". Measured:
//
//   api.github.com/repos/hoferan/website-les-canetons  -> 200
//   api.github.com/repos/symfony/var-dumper            -> 403
//
// Every one of this lock's 121 dist URLs is an api.github.com zipball of a
// third-party repository, so EVERY dist download 403s. No network allowlist can
// change that: GitHub traffic takes the session's GitHub proxy rather than the
// egress allowlist, which is why adding hosts to the allowlist does nothing.
//
// Git is not scoped the same way — `git ls-remote https://github.com/symfony/
// var-dumper.git` succeeds — so `--prefer-source` is the way through. That needs
// two things, and this file is the second:
//
//   1. `composer config --global use-github-api false`, or Composer converts a
//      GitHub source back into an API zipball and lands on the 403 anyway.
//   2. A `source` for the packages that publish none. Exactly one does here:
//      phpstan/phpstan, dist-only on packagist, pulled in transitively by
//      larastan (this repo never requires phpstan directly). `composer install`
//      is all-or-nothing, so that single package fails all 121.
//
// Deriving it is safe rather than a guess. A GitHub zipball URL names the owner,
// the repository and the exact commit:
//
//   https://api.github.com/repos/phpstan/phpstan/zipball/9ba9ac76...
//   ->  https://github.com/phpstan/phpstan.git @ 9ba9ac76...
//
// so the clone lands on the same commit the dist archive was built from. The
// content is identical; only the transport changes.
//
// Two invariants make this safe to do to a lock file at all:
//
//   - `content-hash` is computed from composer.json, NOT from the package
//     entries, so adding a key here cannot invalidate the lock.
//   - Only packages with NO `source` are touched. A package that already has
//     one is left exactly as it is.
import { readFileSync, writeFileSync } from 'node:fs';

/** api.github.com zipball URLs, which is the only dist shape this repo has. */
const GITHUB_ZIPBALL = /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/zipball\/([0-9a-f]+)$/;

/**
 * The git source a dist-only package's own zipball URL implies, or null when
 * the package needs no patching (it already has a source) or when its dist is
 * not a GitHub zipball we can read an owner, repo and commit out of.
 */
export function deriveGitSource(pkg) {
  if (!pkg || pkg.source || !pkg.dist || typeof pkg.dist.url !== 'string') return null;

  const match = GITHUB_ZIPBALL.exec(pkg.dist.url);
  if (!match) return null;

  const [, owner, repo, commit] = match;

  // The dist `reference` is authoritative when present; the URL's commit is the
  // fallback. They are the same value in every entry this repo has, but a lock
  // is written by Composer and we read rather than assume.
  const reference = typeof pkg.dist.reference === 'string' && pkg.dist.reference ? pkg.dist.reference : commit;

  return { type: 'git', url: `https://github.com/${owner}/${repo}.git`, reference };
}

/**
 * Patches a parsed lock in place and returns the names of what changed, so a
 * caller can report it. Mutates, because the caller writes the same object
 * straight back out.
 */
export function addGitSources(lock) {
  const patched = [];

  for (const group of [lock.packages, lock['packages-dev']]) {
    for (const pkg of group ?? []) {
      const source = deriveGitSource(pkg);
      if (!source) continue;
      pkg.source = source;
      patched.push(pkg.name);
    }
  }

  return patched;
}

/**
 * Reads, patches and rewrites a lock file. Composer writes locks with 4-space
 * indentation and a trailing newline; matching that keeps the diff to the lines
 * actually added, which matters when a human looks at what this did.
 */
export function patchLockFile(lockPath) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const patched = addGitSources(lock);
  if (patched.length > 0) writeFileSync(lockPath, `${JSON.stringify(lock, null, 4)}\n`);
  return patched;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lockPath = process.argv[2];
  if (!lockPath) {
    console.error('Usage: node tools/composer-lock-git-sources.mjs <path-to-composer.lock>');
    process.exit(1);
  }

  for (const name of patchLockFile(lockPath)) {
    console.log(`    git source derived for ${name}`);
  }
}
