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
// Usage: node tools/phpunit.mjs [extra artisan test args]
//   node tools/phpunit.mjs --filter=AccountPasswordTest
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);

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

if (dockerAvailable() && stackIsUp()) {
  // The parity run: inside the stack, against the stack's own MariaDB 10.3,
  // which is the version production runs.
  execFileSync(
    'docker',
    ['compose', 'exec', '-w', '/var/www/html/_api', 'web', 'php', 'artisan', 'test', ...args],
    { stdio: 'inherit' }
  );
} else {
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
  execFileSync('php', ['artisan', 'test', ...args], {
    cwd: 'api',
    stdio: 'inherit',
    env: { ...process.env, DB_HOST: process.env.DB_HOST ?? '127.0.0.1' },
  });
}
