#!/usr/bin/env node
/**
 * Runs one of the plugin's PHPUnit suites, in Docker when the stack is up and
 * natively when it is not.
 *
 *   node tools/phpunit.mjs unit          # Docker if available, else native PHP
 *   node tools/phpunit.mjs integration   # Docker only — needs WordPress + MariaDB
 *
 * Invoked through `npm run wp:test:unit` / `wp:test:integration`.
 *
 * Why the unit suite can run without Docker at all: tests/unit/bootstrap.php
 * loads Composer's autoloader and nothing else — no WordPress, no database. That
 * was a deliberate design choice (spec §9) and this is where it pays off, since
 * Claude Code web sessions have no Docker daemon by default
 * (anthropics/claude-code#29515).
 *
 * The integration suite deliberately has NO native fallback: it boots real
 * WordPress against a real MariaDB, so a missing stack is a hard error rather
 * than something to work around quietly. Silently skipping it would be worse
 * than failing — capability enforcement is a security boundary and must not
 * appear "passing" because it never ran.
 *
 * Node rather than shell for two reasons: npm runs scripts through cmd.exe on
 * Windows, where a .sh would not execute; and spawning with an argument array
 * (never a shell string) means Git Bash's MSYS path rewriting cannot mangle
 * /var/www/html into a Windows path — the trap that MSYS_NO_PATHCONV=1 exists
 * for when running docker by hand.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SUITES = {
  unit: { config: 'phpunit-unit.xml.dist', allowNative: true },
  integration: { config: 'phpunit-integration.xml.dist', allowNative: false },
};

const PLUGIN_REL = path.join('wp-content', 'plugins', 'canetons-planning');
const PLUGIN_HOST = path.join(process.cwd(), PLUGIN_REL);
// Forward slashes: this is a path inside a Linux container, not a host path.
const PLUGIN_CONTAINER = '/var/www/html/wp-content/plugins/canetons-planning';

const MIN_PHP = [8, 4];

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const name = process.argv[2];
const suite = SUITES[name];
if (!suite) {
  die(`Usage: node tools/phpunit.mjs <${Object.keys(SUITES).join('|')}>`);
}

if (!existsSync(path.join(PLUGIN_HOST, 'vendor', 'autoload.php'))) {
  die(
    `The plugin's dev dependencies are not installed.\n` +
      `Run: npm run wp:install`
  );
}

/** Whether the `wp` service is up, which is what `docker compose exec` needs. */
function wpContainerRunning() {
  const r = spawnSync('docker', ['compose', 'ps', '--services', '--status', 'running'], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || !r.stdout) {
    return false;
  }
  return r.stdout
    .split('\n')
    .map((line) => line.trim())
    .includes('wp');
}

/** The native PHP version as [major, minor], or null if PHP is unusable. */
function nativePhpVersion() {
  const r = spawnSync('php', ['-r', 'echo PHP_MAJOR_VERSION, ".", PHP_MINOR_VERSION;'], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || !r.stdout) {
    return null;
  }
  const parts = r.stdout.trim().split('.').map(Number);
  return parts.length === 2 && parts.every(Number.isInteger) ? parts : null;
}

function atLeast([major, minor], [reqMajor, reqMinor]) {
  return major > reqMajor || (major === reqMajor && minor >= reqMinor);
}

function run(command, args, options) {
  const r = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (r.error) {
    die(`Could not run ${command}: ${r.error.message}`);
  }
  process.exit(r.status ?? 1);
}

if (wpContainerRunning()) {
  console.log(`[phpunit] ${name}: in the wp container`);
  run('docker', [
    'compose',
    'exec',
    '-w',
    PLUGIN_CONTAINER,
    'wp',
    './vendor/bin/phpunit',
    '-c',
    suite.config,
  ]);
}

if (!suite.allowNative) {
  die(
    `The ${name} suite needs the Docker stack — it boots real WordPress against\n` +
      `a real MariaDB, so there is no native fallback.\n\n` +
      `Start the stack:  npm run wp:dev\n\n` +
      `In a Claude Code web session Docker is not running by default; see\n` +
      `tools/check-web-session.sh and anthropics/claude-code#29515.\n` +
      `Failing here is deliberate — a skipped capability test must never look\n` +
      `like a passing one.`
  );
}

const php = nativePhpVersion();
if (!php) {
  die(
    `Neither the Docker stack nor a native PHP is available.\n\n` +
      `Either:  npm run wp:dev      (then re-run)\n` +
      `or install PHP ${MIN_PHP.join('.')}+ for the Docker-free unit suite.`
  );
}

if (!atLeast(php, MIN_PHP)) {
  die(
    `Native PHP is ${php.join('.')}, but the plugin requires ${MIN_PHP.join('.')}+.\n` +
      `Start the Docker stack instead:  npm run wp:dev`
  );
}

console.log(`[phpunit] ${name}: natively on php ${php.join('.')} (no Docker)`);
// `php vendor/bin/phpunit`, not `./vendor/bin/phpunit` — the latter relies on a
// shebang and an exec bit, neither of which survives a Windows checkout.
run('php', [path.join('vendor', 'bin', 'phpunit'), '-c', suite.config], { cwd: PLUGIN_HOST });
