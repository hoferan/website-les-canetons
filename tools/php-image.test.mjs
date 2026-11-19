// tools/php-image.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { composerRunArgs, ensurePhpImage, PHP_IMAGE, PHP_IMAGE_CONTEXT } from './php-image.mjs';

test('composerRunArgs: Composer in the PHP image, the repository at /app', () => {
  assert.deepEqual(
    composerRunArgs({
      mount: '/repo',
      workdir: 'dist/build/_api',
      env: { COMPOSER_CACHE_DIR: '/app/.composer-cache', COMPOSER_ROOT_VERSION: '1.0.0' },
      args: ['install', '--no-dev'],
    }),
    [
      'run',
      '--rm',
      '-v',
      '/repo:/app',
      '-w',
      '/app/dist/build/_api',
      '-e',
      'COMPOSER_CACHE_DIR=/app/.composer-cache',
      '-e',
      'COMPOSER_ROOT_VERSION=1.0.0',
      PHP_IMAGE,
      'composer',
      'install',
      '--no-dev',
    ]
  );
});

test('composerRunArgs: with no workdir, Composer runs at the repository root', () => {
  const args = composerRunArgs({ mount: '/repo', args: ['install'] });
  assert.equal(args[args.indexOf('-w') + 1], '/app');
  assert.ok(!args.includes('-e'));
});

test('ensurePhpImage: builds docker/php under the tag the runs use', () => {
  const calls = [];
  const tag = ensurePhpImage((command, args) => calls.push([command, args]));
  assert.equal(tag, PHP_IMAGE);
  assert.deepEqual(calls, [['docker', ['build', '--quiet', '--tag', PHP_IMAGE, PHP_IMAGE_CONTEXT]]]);
});

// The artifact build broke on 2026-11-19 when the unpinned composer:2 image
// moved to PHP 8.6 and refused the lock. Production runs PHP 8.4.
test('the image is PHP 8.4, as production, and lets Composer run its plugins as root', () => {
  const dockerfile = readFileSync(`${PHP_IMAGE_CONTEXT}/Dockerfile`, 'utf8');
  assert.match(dockerfile, /^FROM php:8\.4-cli$/m);
  assert.match(dockerfile, /^ENV COMPOSER_ALLOW_SUPERUSER=1$/m);
});

test('no tool runs Composer in an image other than the PHP one', () => {
  const tools = readdirSync('tools', { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs'));
  // A quoted image name, as a `docker run` argument is; comments name it in
  // backticks.
  const floating = tools.filter((file) =>
    /['"]composer:\d/.test(readFileSync(`tools/${file}`, 'utf8'))
  );
  assert.deepEqual(floating, []);

  for (const file of ['build.mjs', 'composer.mjs']) {
    assert.match(
      readFileSync(`tools/${file}`, 'utf8'),
      /from '\.\/php-image\.mjs'/,
      `tools/${file} must run Composer through tools/php-image.mjs`
    );
  }
});
