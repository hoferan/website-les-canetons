// Assembles dist/build/ — the FTP-ready deploy artifact — from app/ plus a
// production-only Composer vendor/ (installed via COMPOSER_VENDOR_DIR, no
// second composer.json needed). Never hand-edit dist/build/; it's
// regenerated on every run.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const mount = process.cwd().split('\\').join('/');

// Bundle JS/CSS first so app/assets/dist/ exists before the app/ -> dist/build/
// copy below picks it up. Invoke Vite's bin directly with the current Node
// executable rather than `npx`: on Windows `npx` is a .cmd shim that
// execFileSync can't spawn without a shell (spawnSync npx ENOENT), so resolve
// the installed vite bin from node_modules and run it — works on every OS.
const require = createRequire(import.meta.url);
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
execFileSync(process.execPath, [viteBin, 'build'], { stdio: 'inherit' });

// Recursive delete that tolerates Windows' intermittent ENOTEMPTY/EPERM when
// removing large trees (e.g. dist/build/api-laravel/vendor's thousands of files): the
// OS can still hold handles briefly (AV scanners, Docker bind-mount, async
// unlink), so Node's maxRetries backs off and retries instead of hard-failing.
const rmrf = (p) => rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

rmrf('dist/build');
cpSync('app', 'dist/build', { recursive: true });

// The raw JS/CSS source is superseded by the bundled output just copied
// above (dist/build/assets/dist/) — the server never references it directly
// anymore (see App\Assets), so don't ship dead source alongside the bundles.
rmrf('dist/build/assets/js');
rmrf('dist/build/assets/css');

// config.php is environment-specific and server-owned (real DB creds + env key).
// Never ship it in the deploy artifact: each server keeps its own, set once by
// hand, and it's excluded from every upload/promotion. Dropping it here (a local
// app/config.php gets copied by the recursive cpSync above) keeps dist/build/ a
// pure, environment-agnostic artifact you can promote test -> qa -> prod unchanged.
rmSync('dist/build/config.php', { force: true });

// php-error.log is a developer's local PHP error log (git-ignored, but the
// cpSync above copies app/ wholesale, so it lands in the artifact and gets
// uploaded). It is never web-readable — the front-controller catch-all in
// .htaccess rewrites any non-/assets/ path to index.php, which 404s it, the
// same way it hides config.php and src/ — but shipping one developer's local
// stack traces to every server is still noise that has no business in an
// environment-agnostic artifact.
rmSync('dist/build/php-error.log', { force: true });

// Ship the template next to the real (never-uploaded) config.php so it's on
// every server for reference — diff it against config.php by hand to see
// what's missing. The deploy CLI (tools/deploy/) also uses it to fail the deploy
// if config.php's shape has drifted (see checkConfigShape there).
cpSync('config/config.example.php', 'dist/build/config.example.php');

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app',
    '-e',
    'COMPOSER_VENDOR_DIR=dist/build/vendor',
    '-e',
    'COMPOSER_CACHE_DIR=/app/.composer-cache',
    'composer:2',
    'install',
    '--no-dev',
    '--optimize-autoloader',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);

// The repo-root composer.json maps App\ -> app/src/ (correct for the dev
// tree, where composer.json sits next to app/). Inside the built dist/build/,
// app/'s CONTENTS were copied flat (classes now live at dist/build/src/, not
// dist/build/app/src/), so the vendor/ installed above has the wrong autoload
// map for this tree. Regenerate it in place, scoped to dist/build/'s own
// flattened layout, reusing the packages already installed — no network
// access, no package re-resolution, just a corrected class map.
//
// This must be the FULL composer.json (require section included), not just
// the autoload section: `composer dump-autoload` only includes a dependency's
// own autoload rules (e.g. nikic/fast-route's FastRoute\ namespace) for
// packages the current composer.json actually requires — a minimal
// autoload-only composer.json silently drops every vendor package's
// autoloading, even though the files are still physically installed.
const rootComposerJson = JSON.parse(readFileSync('composer.json', 'utf8'));
rootComposerJson.autoload = { 'psr-4': { 'App\\': 'src/' } };
writeFileSync('dist/build/composer.json', JSON.stringify(rootComposerJson, null, 2));
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app/dist/build',
    '-e',
    'COMPOSER_CACHE_DIR=/app/.composer-cache',
    'composer:2',
    'dump-autoload',
    '--no-dev',
    '--optimize',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);
rmSync('dist/build/composer.json');

console.log('Built dist/build/ — ready to FTP upload.');

// --- Build the Laravel API project (api/) into dist/build/api-laravel/ ----
//
// Deliberately NOT dist/build/api/. The name originally avoided a collision:
// that path held the OLD app's PHP endpoints (app/api/login.php, events.php,
// …), which Laravel had to live beside rather than on top of. Those are gone —
// the cutover deleted app/api/ — so the collision no longer exists, but the
// name is now load-bearing for a different and stronger reason and MUST NOT be
// "tidied" back to api/.
//
// app/.htaccess dispatches /api/* with `RewriteRule ^api(/|$)
// api-laravel/public/index.php [L]`. In per-directory context that
// substitution re-enters the whole ruleset, so the rule must not match its own
// output. It doesn't, purely because the hyphen defeats `(/|$)`:
// `api-laravel/public/index.php` cannot match `^api(/|$)`. Rename this to
// dist/build/api/ and the rule matches itself on every pass — Apache aborts at
// "Request exceeded the limit of 10 internal redirects" and every /api/* call
// 500s.
//
// So if this ever has to be renamed to something `^api(/|$)` can match, first
// add a `RewriteCond %{ENV:REDIRECT_STATUS} ^$` guard to BOTH dispatch rules,
// the way the front-controller catch-all below them already carries one.
const laravelBuild = 'dist/build/api-laravel';

// Paths that must not travel in the artifact, RELATIVE TO api/. Root-relative
// on purpose, not basename-anywhere: every entry here is a thing Laravel puts
// at a project's root by convention, and a basename match would also strip a
// same-named file nested somewhere that meant it (an app/**/README.md, a
// tests/ fixture directory under resources/).
//
// This is applied as a cpSync filter rather than as rmrf() calls after a
// wholesale copy — the shape the old vendor/node_modules/.env lines used, now
// folded in here. Three reasons: the bytes are never written in the first
// place (this tree is copied on Windows too, where the file's own rmrf()
// comment documents how deleting a just-written tree hits EPERM/ENOTEMPTY and
// has to back off and retry); the whole rule is one list in one place instead
// of a growing tail of deletes; and skipping a directory skips its subtree, so
// tests/ costs one decision rather than a walk.
const LARAVEL_BUILD_EXCLUDES = new Set([
  // Reinstalled below, production-only (--no-dev). node_modules has no
  // server-side role at all.
  'vendor',
  'node_modules',
  // Server-owned, exactly like the old app's config.php: real DB creds and
  // APP_KEY, set once per server by hand. .env.example is deliberately NOT
  // here — it is the provisioning template, and shipping it next to the real
  // file is the point (see staging/README.md).
  '.env',
  // The test suite and its config: 27 test classes that no server ever runs.
  // Harmless (the front-controller catch-all 404s them) but ~200 KB of dead
  // weight on every deploy over a flaky FTP link.
  'tests',
  'phpunit.xml',
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

const laravelSrcRoot = path.resolve('api');

// Compiled Blade views: same defect as .phpunit.result.cache above, found
// while fixing it. Gitignored, written by whatever ran locally, ~180 KB of
// churn per deploy — and Laravel recompiles them on demand anyway. The
// directory itself must survive (its .gitignore is what creates it).
const isCompiledView = (rel) =>
  rel.startsWith('storage/framework/views/') && rel !== 'storage/framework/views/.gitignore';

const includeInLaravelBuild = (src) => {
  const rel = path.relative(laravelSrcRoot, path.resolve(src)).split('\\').join('/');

  // The source root itself, which cpSync also passes through the filter.
  if (rel === '') return true;

  return !LARAVEL_BUILD_EXCLUDES.has(rel) && !isCompiledView(rel);
};

console.log('\nBuilding api/ (Laravel) -> dist/build/api-laravel/ ...');
rmrf(laravelBuild);
cpSync('api', laravelBuild, { recursive: true, filter: includeInLaravelBuild });

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    `/app/${laravelBuild}`,
    '-e',
    'COMPOSER_CACHE_DIR=/app/.composer-cache',
    'composer:2',
    'install',
    '--no-dev',
    '--optimize-autoloader',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);

console.log('Built dist/build/api-laravel/ — ready to FTP upload alongside dist/build/.');
