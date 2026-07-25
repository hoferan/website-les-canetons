import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const run = (...args) =>
  execFileSync(process.execPath, ['tools/build-overlays.mjs', ...args], { encoding: 'utf8' });

test('the docker target merges the dispatch block onto app/.htaccess', () => {
  run('docker');

  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  const dispatch = readFileSync('docker/web/api-dispatch.htaccess', 'utf8').trimEnd();
  const frontController = readFileSync('app/.htaccess', 'utf8').trimEnd();

  assert.ok(out.startsWith(dispatch), 'the dispatch block must come first');
  assert.ok(out.endsWith(`${frontController}\n`), 'app/.htaccess must be appended verbatim');
});

test('the header-forwarding rules precede the first [END] rule, and both dispatch rules end in one', () => {
  run('docker');

  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  assert.match(out, /^RewriteRule \^api\(\/\|\$\) api-laravel\/public\/index\.php \[END\]$/m);
  assert.match(out, /^RewriteRule \^sanctum\(\/\|\$\) api-laravel\/public\/index\.php \[END\]$/m);

  const authRule = out.match(/^RewriteRule .*E=HTTP_AUTHORIZATION.*$/m);
  const firstEndRule = out.match(/^RewriteRule .*\[END\]$/m);
  assert.ok(authRule, 'the E=HTTP_AUTHORIZATION RewriteRule must be present');
  assert.ok(firstEndRule, 'a RewriteRule ending in [END] must be present');
  assert.ok(
    authRule.index < firstEndRule.index,
    'the Authorization forwarding rule must precede the first [END] rule'
  );
});

test('header-forwarding rules run before the first [END], so a reorder cannot silently drop them', () => {
  run('docker');

  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  // Match actual directive LINES, not prose — the explanatory comments above
  // these rules mention "[END]", "E=HTTP_AUTHORIZATION", and
  // "E=HTTP_X_XSRF_TOKEN" too.
  const authRule = out.match(/^RewriteRule .*E=HTTP_AUTHORIZATION.*$/m);
  const xsrfRule = out.match(/^RewriteRule .*E=HTTP_X_XSRF_TOKEN.*$/m);
  const firstEndRule = out.match(/^RewriteRule .*\[END\]$/m);
  assert.ok(authRule, 'the E=HTTP_AUTHORIZATION RewriteRule must be present');
  assert.ok(xsrfRule, 'the E=HTTP_X_XSRF_TOKEN RewriteRule must be present');
  assert.ok(firstEndRule, 'a RewriteRule ending in [END] must be present');
  assert.ok(
    authRule.index < firstEndRule.index,
    'the Authorization forwarding rule must precede the first [END] rule'
  );
  assert.ok(
    xsrfRule.index < firstEndRule.index,
    'the X-XSRF-Token forwarding rule must precede the first [END] rule'
  );
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
