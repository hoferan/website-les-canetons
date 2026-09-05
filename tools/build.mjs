// Assembles dist/build/ — the FTP-ready deploy artifact — from the SPA build in
// web/ plus the Laravel API in api/ with a production-only Composer vendor/.
// The deployed document root is exactly: index.html, assets/, api-laravel/.
// Never hand-edit dist/build/; it's regenerated on every run.
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const mount = process.cwd().split('\\').join('/');

// Recursive delete that tolerates Windows' intermittent ENOTEMPTY/EPERM when
// removing large trees (e.g. dist/build/api-laravel/vendor's thousands of files):
// the OS can still hold handles briefly (AV scanners, Docker bind-mount, async
// unlink), so Node's maxRetries backs off and retries instead of hard-failing.
const rmrf = (p) => rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

// --- Build the SPA (web/) into dist/build/ --------------------------------
//
// THE ORDER OF THE TWO BUILDS IN THIS FILE MATTERS AND IS NOT COSMETIC. Vite
// empties its outDir, so building the SPA AFTER api-laravel/ has been populated
// deletes the entire API from the artifact — a total outage that nothing
// downstream would catch, because the upload would still succeed and only
// /api/* would 500. Never reorder these.
//
// Invoke Vite's bin directly with the current Node executable rather than
// `npx`: on Windows `npx` is a .cmd shim that execFileSync can't spawn without
// a shell (spawnSync npx ENOENT), so resolve the installed vite bin from
// node_modules and run it — works on every OS.
const require = createRequire(import.meta.url);
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
rmrf('dist/build');
execFileSync(process.execPath, [viteBin, 'build'], { stdio: 'inherit' });

// MSW's service worker is a development artifact. Vite copies web/public/
// verbatim, and the worker is only ever registered when VITE_MOCK_API is set,
// but a request interceptor has no business on a server at all — strip it.
rmSync('dist/build/mockServiceWorker.js', { force: true });

console.log('Built dist/build/ (SPA shell + assets) — ready to FTP upload.');


// --- Build the Laravel API project (api/) into dist/build/api-laravel/ ----
//
// Deliberately NOT dist/build/api/. The name originally avoided a collision:
// that path held the OLD app's PHP endpoints (app/api/login.php, events.php,
// …), which Laravel had to live beside rather than on top of. Those are gone —
// the cutover deleted app/api/ — so the collision no longer exists, but the
// name is now load-bearing for a different and stronger reason and MUST NOT be
// "tidied" back to api/.
//
// config/htaccess/site.htaccess dispatches /api/* with `RewriteRule ^api(/|$)
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
