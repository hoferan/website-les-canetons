// What may travel in dist/build/_api/, and what must not.
//
// Extracted from tools/build.mjs so it can be tested without running the build:
// assembling the artifact needs Vite and a Docker daemon, and the rule below is
// exactly the part that has been wrong twice. tools/artifact-excludes.test.mjs
// is the guard.
import path from 'node:path';

// Paths that must not travel in the artifact, RELATIVE TO api/. Root-relative
// on purpose, not basename-anywhere: every entry here is a thing Laravel puts
// at a project's root by convention, and a basename match would also strip a
// same-named file nested somewhere that meant it (an app/**/README.md, a
// tests/ fixture directory under resources/).
//
// This is applied as a cpSync filter rather than as rmrf() calls after a
// wholesale copy — the shape the old vendor/node_modules/.env lines used, now
// folded in here. Three reasons: the bytes are never written in the first
// place (this tree is copied on Windows too, where build.mjs's rmrf() comment
// documents how deleting a just-written tree hits EPERM/ENOTEMPTY and has to
// back off and retry); the whole rule is one list in one place instead of a
// growing tail of deletes; and skipping a directory skips its subtree, so
// tests/ costs one decision rather than a walk.
export const LARAVEL_BUILD_EXCLUDES = new Set([
  // Reinstalled by build.mjs, production-only (--no-dev). node_modules has no
  // server-side role at all.
  'vendor',
  'node_modules',
  // Server-owned, exactly like the old app's config.php: real DB creds and
  // APP_KEY, set once per server by hand. .env.example is deliberately NOT
  // here — it is the provisioning template, and shipping it next to the real
  // file is the point (see staging/README.md).
  '.env',
  // The test suite and its config: test classes that no server ever runs.
  // Harmless (the front-controller catch-all 404s them) but ~200 KB of dead
  // weight on every deploy over a flaky FTP link.
  'tests',
  'phpunit.xml',
  // Dev/test fixtures that create accounts with a known password (`demo`).
  // Nothing on a server currently invokes seeders (RunPendingMigrations and
  // POST /api/migrate both run `migrate` only), but they must never ship
  // regardless — see DevSeeder's own production guard for the second half of
  // this defense.
  'database/seeders',
  // A gitignored local artifact whose bytes change on every local test run.
  // Worse than dead weight: it re-uploads on every deploy, and it makes a
  // locally-built artifact differ byte-for-byte from a CI-built one.
  '.phpunit.result.cache',
  // Repo/editor metadata. Nested .gitignore files are deliberately NOT matched
  // by this root-relative set — the ones under storage/ and bootstrap/cache/
  // are what makes those runtime-writable directories exist on a server at all
  // (the deploy CLI prunes directories left empty).
  '.editorconfig',
  '.gitignore',
  '.gitattributes',
  // Laravel's stock skeleton docs, about the framework rather than this app.
  'README.md',
  'CHANGELOG.md',
]);

// Directories that exist ON A SERVER as empty, writable scratch space, and
// whose CONTENTS are always the local machine's rather than anything the
// artifact should carry.
//
// THE DIRECTORY MUST SURVIVE AND ITS CONTENTS MUST NOT, which is why this is a
// prefix rule with a `.gitignore` carve-out rather than a LARAVEL_BUILD_EXCLUDES
// entry: each of these is created on a server only by its own tracked
// .gitignore arriving, because the deploy CLI prunes directories left empty.
// Drop the directory and Laravel has nowhere to write; drop only the contents
// and the server keeps its own.
//
// WHY THIS IS A BUG AND NOT HOUSEKEEPING (issue #109): storage/logs/laravel.log
// is the one that bites. A deploy from a developer's machine UPLOADS that
// developer's local Laravel log, and the next deploy from anywhere else deletes
// it as stale — so a server's own error log, which is precisely what you want
// to read after a bad deploy, is first overwritten with local noise and then
// removed. Local stack traces reaching a server is a small disclosure on top,
// even behind the api/.htaccess 403 boundary.
//
// The rest are caches. They are gitignored, they change on every local run, and
// they make a locally-built artifact differ byte-for-byte from a CI-built one —
// the same defect as .phpunit.result.cache above, which is how this was found.
// Laravel regenerates every one of them on demand.
export const RUNTIME_WRITABLE_DIRS = [
  'storage/logs',
  'storage/framework/cache',
  'storage/framework/sessions',
  'storage/framework/testing',
  'storage/framework/views',
  'bootstrap/cache',
];

/**
 * True for a path inside one of the runtime-writable directories above, except
 * that directory's own tracked `.gitignore`.
 *
 * Nested matches count: `storage/framework/views/test_4/<hash>.php` is a
 * parallel-test worker's compiled views, and a rule that only looked one level
 * deep would ship them.
 *
 * @param {string} rel path relative to api/, forward-slashed
 */
export const isRuntimeWritableContent = (rel) =>
  RUNTIME_WRITABLE_DIRS.some(
    (dir) => rel.startsWith(`${dir}/`) && rel !== `${dir}/.gitignore`
  );

/**
 * The cpSync filter for api/ -> dist/build/_api/.
 *
 * ONE PATH AT A TIME, which is what cpSync asks. It is not the same question as
 * "does this file end up in the artifact" — see travelsInArtifact below.
 *
 * @param {string} src absolute or cwd-relative path being copied
 * @param {string} srcRoot absolute path of api/
 */
export const includeInLaravelBuild = (src, srcRoot) => {
  const rel = path.relative(srcRoot, path.resolve(src)).split('\\').join('/');

  // The source root itself, which cpSync also passes through the filter.
  if (rel === '') return true;

  return !LARAVEL_BUILD_EXCLUDES.has(rel) && !isRuntimeWritableContent(rel);
};

/**
 * Whether a file actually ends up in dist/build/_api/.
 *
 * cpSync never descends into a directory its filter rejected, so a file is
 * copied only when it AND EVERY ANCESTOR pass. That difference is not
 * academic: `vendor` is one root-relative exclude, and asking the filter about
 * `vendor/autoload.php` on its own answers "yes, copy it" — a wrong answer that
 * describes 24 000 files. Anything reasoning about the artifact's contents
 * (the tests, in particular) must ask this and not the filter.
 *
 * @param {string} rel path relative to api/, forward-slashed
 */
export const travelsInArtifact = (rel) => {
  const parts = rel.split('/');

  return parts.every((_, i) => {
    const ancestor = parts.slice(0, i + 1).join('/');

    return !LARAVEL_BUILD_EXCLUDES.has(ancestor) && !isRuntimeWritableContent(ancestor);
  });
};
