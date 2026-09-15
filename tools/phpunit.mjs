// Runs the Laravel test suite, in Docker or natively, from one command.
//
// WHY IT EXISTS. The suite needs a live database, which is why `npm run check`
// leaves it out and why CLAUDE.md used to give the raw command
// `docker compose exec -w /var/www/html/_api web php artisan test`. That
// command is correct and remains the parity run, but it is the ONLY way the
// suite was ever documented — so on a Claude Code web session, which has PHP
// and MariaDB natively and no Docker, the documented command simply fails and
// the suite reads as unrunnable. It is not: it wants one environment variable.
//
// THE ONE VARIABLE IS DB_HOST. api/phpunit.xml pins `DB_HOST=db`, the compose
// service name, which resolves inside the stack and nowhere else. PHPUnit's
// <env> entries do not overwrite a variable that is already set, so exporting
// DB_HOST=127.0.0.1 is enough to point the same suite at a native MariaDB —
// no second phpunit.xml, no profile, no edit to the committed one.
//
// NOT runInPhp(). Its Docker branch starts a FRESH php:8.4-cli container,
// which is not attached to the compose network and so cannot resolve `db`
// either; pint and phpstan are fine there because neither touches the
// database. This one has to exec into the running `web` service instead, so it
// makes that choice itself rather than borrowing the wrong helper.
//
// EVERY FAILURE GOES THROUGH describeFailure(), and none of them throws.
// execFileSync throws on any non-zero exit, so left alone this file printed
// five frames of node:internal after a red suite — on top of the test output
// that is the entire reason anyone ran it. tools/ensure-dev-stack.mjs takes the
// same care for the same reason; see the comment there.
//
// Usage: node tools/phpunit.mjs [extra artisan test args]
//   node tools/phpunit.mjs --filter=AccountPasswordTest
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function dockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function stackIsUp() {
  try {
    const running = execSync('docker compose ps --status running --services', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return running.split('\n').includes('web');
  } catch {
    return false;
  }
}

/**
 * What to exit with, and what to say first, when a run fails.
 *
 * A red suite has already printed everything worth reading, so this adds
 * nothing and hands back the suite's own status, rather than flattening every
 * failure to 1 and discarding whatever the runner meant by its own code.
 *
 * ENOENT is the other case, and the only one worth a sentence: the binary is
 * absent, so nothing ran and there is no output to interpret. It is reachable
 * for anybody whose stack is down and who has no native PHP, which on this
 * project is every Windows developer — `npm install` provisions no PHP.
 */
export function describeFailure(error, binary) {
  if (error?.code === 'ENOENT') {
    return {
      status: 1,
      message:
        `\`${binary}\` is not on PATH, so there is no test runner to start.\n` +
        'Bring the Docker stack up with `npm run dev`, or provision a native\n' +
        'PHP and MariaDB with `npm run websession:init` (web session).',
    };
  }

  return { status: Number.isInteger(error?.status) ? error.status : 1, message: null };
}

function run(binary, argv, options) {
  try {
    execFileSync(binary, argv, { stdio: 'inherit', ...options });
  } catch (error) {
    const { status, message } = describeFailure(error, binary);
    if (message) {
      console.error(message);
    }
    process.exit(status);
  }
}

function main(args) {
  if (dockerAvailable() && stackIsUp()) {
    // The parity run: inside the stack, against the stack's own MariaDB 10.3,
    // which is the version production runs.
    run('docker', [
      'compose',
      'exec',
      '-w',
      '/var/www/html/_api',
      'web',
      'php',
      'artisan',
      'test',
      ...args,
    ]);
    return;
  }

  if (!existsSync('api/vendor/autoload.php')) {
    console.error(
      'api/vendor is not installed, so there is no test runner.\n' +
        'Run `npm run websession:init` (web session) or `npm run dev` (Docker) first.'
    );
    process.exit(1);
  }

  // Native: a web session, or a developer with the stack down. MariaDB is
  // 10.11 from apt rather than production's 10.3 — see tools/ensure-dev-stack.sh
  // for why that matters for anything schema-shaped.
  run('php', ['artisan', 'test', ...args], {
    cwd: 'api',
    env: { ...process.env, DB_HOST: process.env.DB_HOST ?? '127.0.0.1' },
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2));
}
