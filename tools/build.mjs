// Assembles dist/build/ — the FTP-ready deploy artifact — from the SPA build in
// web/ plus the Laravel API in api/ with a production-only Composer vendor/.
// The deployed document root is exactly: index.html, assets/, _api/.
// Never hand-edit dist/build/; it's regenerated on every run.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { includeInLaravelBuild } from './artifact-excludes.mjs';
import { COMPOSER_ROOT_VERSION, findVcsStamps } from './artifact-vendor.mjs';

const mount = process.cwd().split('\\').join('/');

// Recursive delete that tolerates Windows' intermittent ENOTEMPTY/EPERM when
// removing large trees (e.g. dist/build/_api/vendor's thousands of files):
// the OS can still hold handles briefly (AV scanners, Docker bind-mount, async
// unlink), so Node's maxRetries backs off and retries instead of hard-failing.
const rmrf = (p) => rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

// --- Build the SPA (web/) into dist/build/ --------------------------------
//
// THE ORDER OF THE TWO BUILDS IN THIS FILE MATTERS AND IS NOT COSMETIC. Vite
// empties its outDir, so building the SPA AFTER _api/ has been populated
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


// --- Build the Laravel API project (api/) into dist/build/_api/ -----------
//
// The Laravel project's directory name inside the artifact.
//
// config/htaccess/site.htaccess dispatches /api/* with `RewriteRule ^api(/|$)
// _api/public/index.php [L]`. In per-directory context that substitution
// re-enters the whole ruleset, so the rule must not match its own output.
//
// `^api(/|$)` matches a path that is EXACTLY `api` or that begins `api/`, so
// every other name is safe — including this one, which begins with an
// underscore. (The previous name, api-laravel, was safe for the same reason,
// though the comment here used to credit the hyphen specifically, which is
// true but narrower than the actual rule.) Rename this to dist/build/api/ and
// the rule matches itself on every pass: Apache aborts at "Request exceeded
// the limit of 10 internal redirects" and every /api/* call 500s.
//
// So if this ever has to be renamed to something `^api(/|$)` CAN match, first
// add a `RewriteCond %{ENV:REDIRECT_STATUS} ^$` guard to BOTH dispatch rules,
// the way the SPA fallback below them already carries one.
//
// The leading underscore is also the point: it reads as "not a public
// resource" in an FTP listing, and it names no framework, so it does not have
// to change if the stack ever does.
const laravelBuild = 'dist/build/_api';

// What may travel and what may not lives in tools/artifact-excludes.mjs, with
// the reasoning for each entry. It is a separate module for one reason: this
// file cannot be run without Vite and a Docker daemon, and that rule is the
// part that has been wrong twice — once shipping a developer's Laravel log to
// the server (#109). tools/artifact-excludes.test.mjs guards it, including a
// general check that no untracked file under api/ can reach the artifact.
const laravelSrcRoot = path.resolve('api');

console.log('\nBuilding api/ (Laravel) -> dist/build/_api/ ...');
rmrf(laravelBuild);
cpSync('api', laravelBuild, {
  recursive: true,
  filter: (src) => includeInLaravelBuild(src, laravelSrcRoot),
});

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
    // Keep the generated vendor/ machine-independent (#109). Composer
    // describes the ROOT package from whatever VCS surrounds the directory it
    // installs into — and that directory is inside this repository, so without
    // this it writes the building checkout's HEAD and branch into
    // vendor/composer/installed.php. Naming the version stops it asking git.
    // tools/artifact-vendor.mjs has the measurement and why this value.
    '-e',
    `COMPOSER_ROOT_VERSION=${COMPOSER_ROOT_VERSION}`,
    'composer:2',
    'install',
    '--no-dev',
    '--optimize-autoloader',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);

// installed.php is generated in place by the run above rather than copied, so
// tools/artifact-excludes.mjs cannot reach it and the unit tests can only
// prove the detector works. This is the assertion against the real file, and
// it runs wherever a build does — including CI's `build` job.
const installedPhp = `${laravelBuild}/vendor/composer/installed.php`;
const stamps = findVcsStamps(readFileSync(installedPhp, 'utf8'));

if (stamps.length > 0) {
  throw new Error(
    `${installedPhp} carries the building machine's identity, so this artifact would ` +
      'differ from one built anywhere else from the same tree and re-upload on every ' +
      `deploy:\n  ${stamps.join('\n  ')}\n` +
      'See tools/artifact-vendor.mjs.'
  );
}

console.log('Built dist/build/_api/ — ready to FTP upload alongside dist/build/.');
