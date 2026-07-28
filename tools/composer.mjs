#!/usr/bin/env node
/**
 * Runs Composer for the plugin, in Docker when a daemon is available and with a
 * native `composer` when it is not.
 *
 *   node tools/composer.mjs install
 *   node tools/composer.mjs require --dev some/package
 *
 * Invoked through `npm run wp:install`.
 *
 * Docker is preferred because the composer:2 image pins the Composer version and
 * needs no local PHP at all. The native path exists for Claude Code web
 * sessions, where no Docker daemon runs by default
 * (anthropics/claude-code#29515) — see tools/check-web-session.sh.
 *
 * Node rather than shell: npm runs scripts through cmd.exe on Windows, and
 * spawning with an argument array keeps Git Bash's MSYS path rewriting from
 * mangling the container paths.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PLUGIN_HOST = path.join(process.cwd(), 'wp-content', 'plugins', 'canetons-planning');

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push('install');
}

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!existsSync(path.join(PLUGIN_HOST, 'composer.json'))) {
  die(`No composer.json at ${PLUGIN_HOST}`);
}

function dockerAvailable() {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return r.status === 0;
}

function commandExists(command) {
  const r = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

function run(command, argv, options) {
  const r = spawnSync(command, argv, { stdio: 'inherit', ...options });
  if (r.error) {
    die(`Could not run ${command}: ${r.error.message}`);
  }
  process.exit(r.status ?? 1);
}

if (dockerAvailable()) {
  console.log('[composer] via the composer:2 image');
  run('docker', [
    'run',
    '--rm',
    // An absolute host path is required by -v. Docker Desktop accepts a Windows
    // path here; passing it as an argv element keeps any shell out of the way.
    '-v',
    `${PLUGIN_HOST}:/app`,
    '-w',
    '/app',
    'composer:2',
    ...args,
    '--no-interaction',
  ]);
}

if (commandExists('composer')) {
  console.log('[composer] natively (no Docker daemon)');
  run('composer', [...args, '--no-interaction'], { cwd: PLUGIN_HOST });
}

die(
  `Neither a Docker daemon nor a native \`composer\` is available.\n\n` +
    `Either:  start Docker, then re-run\n` +
    `or install Composer:\n` +
    `    curl -sS https://getcomposer.org/installer | php\n` +
    `    sudo mv composer.phar /usr/local/bin/composer\n\n` +
    `In a Claude Code web session, run \`bash tools/check-web-session.sh\` first —\n` +
    `it reports whether Docker can be started there at all.`
);
