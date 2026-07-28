#!/usr/bin/env node
/**
 * One-command setup for unit-TDD in a Claude Code web session.
 *
 *   npm run wp:websession:init
 *
 * Web sessions have no usable Docker (dockerd can start but without bridge
 * networking, so the stack cannot run — anthropics/claude-code#29515). The
 * plugin's UNIT suite needs none of it: tests/unit/bootstrap.php loads only
 * Composer's autoloader. This script gets a fresh session from clone to
 * unit-tests-green in one idempotent step:
 *
 *   1. preflight  — native PHP >= 8.4 and a `composer` binary
 *   2. install    — the plugin's dev deps (native, via tools/composer.mjs)
 *   3. verify     — run the unit suite (tools/phpunit.mjs)
 *
 * It never starts, requires, or stops Docker. The INTEGRATION suite is out of
 * scope by design — it needs real WordPress + MariaDB, which only local Docker
 * provides; `npm run wp:test:integration` fails loudly rather than pretending.
 *
 * Safe to re-run, and safe outside a web session (it just runs natively).
 */

import { spawnSync } from 'node:child_process';

const MIN_PHP = [8, 4];

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`\n→ ${message}`);
}

/** Native PHP version as [major, minor], or null if PHP is unusable. */
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

function commandExists(command) {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

/** Run a step, aborting the whole init on failure. */
function runOrFail(command, args, label) {
  const r = spawnSync(command, args, { stdio: 'inherit' });
  if (r.error || (r.status ?? 1) !== 0) {
    fail(`${label} failed. See the output above.`);
  }
}

const seeCheck = 'For a full picture of this session, run: bash tools/check-web-session.sh';

// 1. Preflight.
step('Preflight: native PHP and Composer');

const php = nativePhpVersion();
if (!php) {
  fail(`No usable native \`php\`.\n${seeCheck}`);
}
if (!atLeast(php, MIN_PHP)) {
  fail(
    `Native PHP is ${php.join('.')}, but the plugin requires >= ${MIN_PHP.join('.')}.\n${seeCheck}`
  );
}
if (!commandExists('composer')) {
  fail(`No native \`composer\` on PATH.\n${seeCheck}`);
}
console.log(`  php ${php.join('.')}, composer present`);

// 2. Install dev deps. tools/composer.mjs goes native in a web session.
step("Installing the plugin's dev dependencies");
runOrFail('node', ['tools/composer.mjs', 'install'], 'Dependency install');

// 3. Verify with the unit suite.
step('Running the unit suite');
runOrFail('node', ['tools/phpunit.mjs', 'unit'], 'Unit suite');

console.log(
  '\n✓ Ready for unit TDD: edit code, then `npm run wp:test:unit`.\n' +
    '  The integration suite needs local Docker; it does not run in a web session.'
);
