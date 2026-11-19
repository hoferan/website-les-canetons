// The PHP that every Composer run started from tools/ executes under: the
// image docker/php/Dockerfile builds, php:8.4-cli with the extensions the API
// needs. It is the PHP production runs (CLAUDE.md: match production versions),
// and the one the compose `php` service and CI's setup-php jobs already use.
//
// Composer used to run in the official `composer:2` image. That image follows
// the latest PHP, not ours: on 2026-11-19 it moved to PHP 8.6, and
// `composer install` refused the lock, because openspout/openspout v5.11.3
// allows only PHP 8.4 and 8.5. The artifact build failed in CI and would have
// failed every deploy. Its PHP is a choice this repository makes, so it is
// named here rather than inherited from whatever an upstream tag points at.
//
// The image is built from the Dockerfile on first use and from Docker's layer
// cache afterwards, so every machine and CI runner gets the same PHP minor.
import { execFileSync } from 'node:child_process';

/** The tag tools/ builds docker/php/Dockerfile under. */
export const PHP_IMAGE = 'lescanetons-php-tools';

/** The build context: the Dockerfile the compose `php` service builds too. */
export const PHP_IMAGE_CONTEXT = 'docker/php';

/** Builds (or, from the layer cache, confirms) the image and returns its tag. */
export function ensurePhpImage(exec = execFileSync) {
  // The build log goes to stderr, so a cold build in CI is visible; --quiet
  // keeps the image id off stdout.
  exec('docker', ['build', '--quiet', '--tag', PHP_IMAGE, PHP_IMAGE_CONTEXT], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return PHP_IMAGE;
}

/**
 * The `docker run` arguments for one Composer command in that image: the
 * repository mounted at /app, `workdir` relative to it, `env` as -e flags.
 */
export function composerRunArgs({ mount, workdir = '.', env = {}, args }) {
  return [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    workdir === '.' ? '/app' : `/app/${workdir}`,
    ...Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
    PHP_IMAGE,
    'composer',
    ...args,
  ];
}
