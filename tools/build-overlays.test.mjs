import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const run = (...args) =>
  execFileSync(process.execPath, ['tools/build-overlays.mjs', ...args], { encoding: 'utf8' });

test('the docker target is the plain front controller', () => {
  run('docker');

  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  const frontController = readFileSync('app/.htaccess', 'utf8').trimEnd();

  // The Laravel dispatch block lives in app/.htaccess now, so there is nothing
  // left to merge: the local Docker document root gets exactly what prod gets.
  assert.equal(out, `${frontController}\n`);
});

test('app/.htaccess dispatches /api and /sanctum into Laravel with [L], never the END flag', () => {
  const frontController = readFileSync('app/.htaccess', 'utf8');

  assert.match(frontController, /^RewriteRule \^api\(\/\|\$\) api-laravel\/public\/index\.php \[L\]$/m);
  assert.match(frontController, /^RewriteRule \^sanctum\(\/\|\$\) api-laravel\/public\/index\.php \[L\]$/m);

  // The END flag is Apache 2.3.9+; an unknown RewriteRule flag is a syntax
  // error, so on a 2.2 host it would 500 EVERY request to the whole site.
  // Check directive LINES, not prose — the comment above those two rules
  // deliberately explains why that flag is not used here.
  const directives = frontController.split('\n').filter((line) => !line.trimStart().startsWith('#'));
  assert.ok(
    !directives.some((line) => line.includes('[END]')),
    'no directive may use the Apache 2.4-only [END] flag'
  );
});

test('the header-forwarding rules precede the dispatch rules in app/.htaccess', () => {
  // If a reorder ever put the dispatch first, [L] would end the pass before
  // Authorization was forwarded and every token-authenticated request would
  // silently look anonymous. Match actual directive LINES, not prose — the
  // explanatory comments mention these same names.
  const frontController = readFileSync('app/.htaccess', 'utf8');

  const authRule = frontController.match(/^RewriteRule .*E=HTTP_AUTHORIZATION.*$/m);
  const xsrfRule = frontController.match(/^RewriteRule .*E=HTTP_X_XSRF_TOKEN.*$/m);
  const firstDispatch = frontController.match(/^RewriteRule .*api-laravel\/public\/index\.php.*$/m);
  assert.ok(authRule, 'the E=HTTP_AUTHORIZATION RewriteRule must be present');
  assert.ok(xsrfRule, 'the E=HTTP_X_XSRF_TOKEN RewriteRule must be present');
  assert.ok(firstDispatch, 'a dispatch RewriteRule into api-laravel/ must be present');
  assert.ok(
    authRule.index < firstDispatch.index,
    'the Authorization forwarding rule must precede the first dispatch rule'
  );
  assert.ok(
    xsrfRule.index < firstDispatch.index,
    'the X-XSRF-Token forwarding rule must precede the first dispatch rule'
  );
});

test('the dispatch rules precede the legacy-URL redirect and the front-controller catch-all', () => {
  // The catch-all matches every path, so if it came first the dispatch would
  // never run at all.
  const frontController = readFileSync('app/.htaccess', 'utf8');

  const firstDispatch = frontController.match(/^RewriteRule .*api-laravel\/public\/index\.php.*$/m);
  const legacyRedirect = frontController.match(/^RedirectMatch 301 .*$/m);
  const catchAll = frontController.match(/^RewriteRule \^ index\.php \[L\]$/m);
  assert.ok(firstDispatch, 'a dispatch RewriteRule into api-laravel/ must be present');
  assert.ok(legacyRedirect, 'the legacy .html -> .php RedirectMatch must be present');
  assert.ok(catchAll, 'the front-controller catch-all must be present');
  assert.ok(firstDispatch.index < legacyRedirect.index, 'dispatch must precede RedirectMatch 301');
  assert.ok(firstDispatch.index < catchAll.index, 'dispatch must precede the catch-all');
});

test('docker is not part of the default (server) run', () => {
  // This invokes the real CLI with no args, so it also rebuilds the actual
  // dist/overlay/{test,qa,prod} server overlays as a side effect (reading
  // .env.test/.env.qa and copying git-ignored staging/*/.htpasswd files if
  // present). dist/ is git-ignored, so this is harmless, just worth knowing.
  const stdout = run();
  assert.doesNotMatch(stdout, /dist\/overlay\/docker/);
});

test('docker is not part of an `all` run either', () => {
  const stdout = run('all');
  assert.doesNotMatch(stdout, /dist\/overlay\/docker/);
});

test('the docker run does not print the server upload hint', () => {
  const stdout = run('docker');
  assert.doesNotMatch(stdout, /Upload each env overlay/);
});
