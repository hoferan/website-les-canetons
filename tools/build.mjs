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
// removing large trees (e.g. dist/build/api/vendor's thousands of files): the
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

// Ship the numbered migrations so the server-side endpoint (dist/build/api/migrate.php)
// can apply them. They live under dist/build/sql/migrations and are unreachable via
// direct HTTP: the front-controller catch-all (app/.htaccess) rewrites any
// non-/assets/ path to index.php, which 404s anything that isn't a route.
cpSync('sql/migrations', 'dist/build/sql/migrations', { recursive: true });

// config.php is environment-specific and server-owned (real DB creds + env key).
// Never ship it in the deploy artifact: each server keeps its own, set once by
// hand, and it's excluded from every upload/promotion. Dropping it here (a local
// app/config.php gets copied by the recursive cpSync above) keeps dist/build/ a
// pure, environment-agnostic artifact you can promote test -> qa -> prod unchanged.
rmSync('dist/build/config.php', { force: true });

// Ship the template next to the real (never-uploaded) config.php so it's on
// every server for reference — diff it against config.php by hand to see
// what's missing. deploy.mjs also uses it to fail the deploy if config.php's
// shape has drifted (see checkConfigShape there).
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

// --- Build the Laravel API project (api/) into dist/build/api/ -----------
console.log('\nBuilding api/ (Laravel)...');
rmrf('dist/build/api');
cpSync('api', 'dist/build/api', { recursive: true });
rmrf('dist/build/api/vendor');
rmrf('dist/build/api/node_modules');
rmSync('dist/build/api/.env', { force: true });

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app/dist/build/api',
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

console.log('Built dist/build/api/ — ready to FTP upload alongside dist/build/.');
