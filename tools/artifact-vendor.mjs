// Whether the artifact's generated vendor/ carries the identity of the machine
// that built it.
//
// Extracted from tools/build.mjs for the same reason artifact-excludes.mjs was:
// the build cannot run without Vite and a Docker daemon, so a rule kept inside
// it cannot be tested at all. tools/artifact-vendor.test.mjs is the guard.
//
// WHAT THIS IS ABOUT (issue #109). Two deploys of trees that `git diff --stat`
// calls identical reported "2 changed": deployment.json, which carries the
// commit and is meant to, and _api/vendor/composer/installed.php, which is
// generated inside the artifact and should not vary at all. It varies because
// Composer describes the ROOT package from whatever VCS it finds around the
// directory it installs into — and build.mjs installs into dist/build/_api,
// inside this repository. So the root entry records the building checkout's
// HEAD commit and branch:
//
//     'pretty_version' => 'dev-main',
//     'reference' => 'c37499d8b40aa0492cb4ed491968836aae70de2e',
//
// A developer's build of a commit and CI's build of the merge commit for that
// same tree therefore differ, and every deploy re-uploads the file. It is the
// ONLY file in the whole vendor tree that carries anything machine-specific —
// verified by installing the same lock twice and diffing the trees.
//
// The fix is in build.mjs: COMPOSER_ROOT_VERSION pins the root version, which
// stops Composer consulting the VCS at all and leaves the reference null. This
// module is what keeps it that way.

// The root version the artifact's Composer install is pinned to.
//
// Setting it at all is the fix: with COMPOSER_ROOT_VERSION in the environment
// Composer takes the root version as given and never asks git, so the
// reference stays null and nothing about the building checkout is recorded.
//
// This particular value is Composer's own fallback when it has no VCS to
// guess from, confirmed by installing this same lock in a directory outside
// any git repository. So the artifact's vendor/ comes out byte-identical to
// one built from a plain export of the tree, which is what it should have
// looked like all along. Any fixed value would be reproducible; this one is
// also honest, because the artifact really has no version.
export const COMPOSER_ROOT_VERSION = '1.0.0+no-version-set';

/**
 * The contents of the `array( ... )` that starts at or after `from`, by paren
 * matching. Every entry nests an `array()` of its own for `aliases`, so a scan
 * that read indentation would stop at the wrong line.
 */
const blockAt = (src, from) => {
  // `from` is an indexOf result, so -1 means "not there". String.indexOf
  // clamps a negative start to 0, which would quietly match the first paren in
  // the file and report a missing entry as an empty one.
  if (from === -1) return null;

  const open = src.indexOf('(', from);

  if (open === -1) return null;

  let depth = 0;

  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;

      if (depth === 0) return src.slice(open + 1, i);
    }
  }

  return null;
};

/** A `'name' => 'value'` / `'name' => null` field of one entry. */
const field = (block, name) => {
  const found = new RegExp(`'${name}' => (null|'[^']*')`).exec(block);

  if (!found) return undefined;

  return found[1] === 'null' ? null : found[1].slice(1, -1);
};

/**
 * Every block describing the root package. Composer writes it twice — once
 * under 'root' and once under its own name in 'versions' — and a guard that
 * read only the first would pass a file that still names the branch further
 * down.
 */
const rootEntries = (src) => {
  const rootBlock = blockAt(src, src.indexOf("'root' => array"));

  if (rootBlock === null) return [];

  const name = field(rootBlock, 'name');
  const blocks = [rootBlock];
  const restated = name === undefined ? -1 : src.indexOf(`'${name}' => array`);

  if (restated !== -1) blocks.push(blockAt(src, restated));

  return blocks.filter((block) => block !== null);
};

/**
 * What in an installed.php came from the building machine's checkout rather
 * than from composer.lock. Empty means the file is reproducible.
 *
 * Dependencies' `reference` fields are commit SHAs too, and legitimate: they
 * are read out of the lock and are identical everywhere. Only the root
 * package's are the build machine's, which is why this looks the root up by
 * name instead of banning SHAs.
 *
 * @param {string} src contents of vendor/composer/installed.php
 * @returns {string[]} one line per stamp found
 */
export const findVcsStamps = (src) => {
  const entries = rootEntries(src);

  if (entries.length === 0) {
    return [
      'no root package entry found in installed.php — Composer may have changed the ' +
        'file’s shape, and a guard that cannot read it is guarding nothing.',
    ];
  }

  const stamps = [];

  for (const entry of entries) {
    const reference = field(entry, 'reference');

    if (reference !== null && reference !== undefined) {
      stamps.push(
        `root package reference '${reference}' is the building checkout's commit, ` +
          'not anything from composer.lock'
      );
    }

    for (const name of ['pretty_version', 'version']) {
      const version = field(entry, name);

      // `dev-<branch>` is Composer's VCS guess, so it names the branch the
      // build ran on. Any fixed value — including Composer's own
      // '1.0.0+no-version-set' fallback — is machine-independent and fine.
      if (typeof version === 'string' && version.startsWith('dev-')) {
        stamps.push(`root package ${name} '${version}' names the building checkout's branch`);
      }
    }
  }

  // Composer restates the root package, so every stamp is found twice. The
  // reader of this list is someone staring at a failed build.
  return [...new Set(stamps)];
};
