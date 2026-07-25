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

test('the dispatch rules terminate rewriting so the catch-all cannot hijack them', () => {
  run('docker');

  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  assert.match(out, /^RewriteRule \^api\(\/\|\$\) api-laravel\/public\/index\.php \[END\]$/m);
  assert.match(out, /^RewriteRule \^sanctum\(\/\|\$\) api-laravel\/public\/index\.php \[END\]$/m);
});

test('docker is not part of the default (server) run', () => {
  const stdout = run();
  assert.doesNotMatch(stdout, /dist\/overlay\/docker/);
});
