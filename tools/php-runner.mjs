// Runs a PHP command where PHP is: the compose `php` service, or else a native
// php on PATH. Pint, Larastan, the OpenAPI export and the Laravel suite all go
// through here, and so do `npm run php`, `npm run artisan` and `npm run
// composer`.
//
// THE ORDER IS FIXED:
//
//   1. `docker compose exec php …` when that service is running and healthy.
//      It is long-running (see docker-compose.yml), so there is no container
//      start to pay for, it is on the compose network where `db` resolves, and
//      its vendor/ is the api_vendor volume, which its own entrypoint keeps
//      installed.
//   2. Native `php`: a Claude Code web session, CI, or a developer with PHP
//      installed. vendor/ is then the host's api/vendor, which each tool
//      self-heals through ensureApiVendor() (tools/api-vendor.mjs).
//   3. Neither: say to run `npm run dev` and exit 1, rather than fall through
//      to an ENOENT.
//
// A Docker daemon alone does not count, and nothing here starts a container:
// a fresh one would pay the cold start this service exists to avoid, could not
// resolve `db`, and would see the host's api/vendor instead of the volume. A
// CI runner has a daemon and no stack, so it takes the native branch, which
// is what CI's setup-php provides.
//
// Usage as a CLI (the npm pass-throughs):
//   node tools/php-runner.mjs php -v
//   node tools/php-runner.mjs artisan route:list
//   node tools/php-runner.mjs composer outdated
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The compose service this file execs into. */
export const SERVICE = 'php';

/** Where docker-compose.yml mounts the repository inside that service. */
const CONTAINER_ROOT = '/repo';

/**
 * The `php` service's state: 'healthy', 'starting' (up, but its entrypoint is
 * still installing vendor/), or null when it is not running or there is no
 * daemon to ask.
 */
export function serviceState() {
  let out;
  try {
    out = execFileSync('docker', ['compose', 'ps', '--format', 'json', SERVICE], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }

  // One JSON object per line on current Compose; an array on some older ones.
  const rows = out
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)].flat();
      } catch {
        return [];
      }
    });
  const row = rows.find((r) => r.Service === SERVICE && r.State === 'running');
  if (!row) return null;
  return row.Health === 'healthy' ? 'healthy' : 'starting';
}

function nativePhpAvailable() {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure, so the order can be tested without Docker or PHP: the container wins
 * whenever it is healthy, native php comes next, and a container that is still
 * starting is reported as such rather than skipped for a native php the
 * developer may not have meant to use.
 *
 * @returns 'container' | 'native' | 'starting' | null
 */
export function chooseTarget({ state, native }) {
  if (state === 'healthy') return 'container';
  if (state === 'starting') return 'starting';
  return native() ? 'native' : null;
}

let cachedTarget;

/** Where PHP commands run in this process. Probed once, then remembered. */
export function phpTarget() {
  cachedTarget ??= chooseTarget({ state: serviceState(), native: nativePhpAvailable });
  return cachedTarget;
}

/**
 * What to exit with, and what to say first, when a run fails.
 *
 * A failed command has already printed everything worth reading, so this adds
 * nothing and hands back the command's own status, rather than flattening every
 * failure to 1 and discarding whatever the tool meant by its own code. Pint
 * --test exits 1 for a dirty tree, PHPStan 1 for errors, and the suite its own.
 *
 * ENOENT is the other case, and the only one worth a sentence: the binary is
 * absent, so nothing ran and there is no output to interpret. phpTarget()
 * probes for the binary first, so this is the backstop for a PATH that changed
 * between the probe and the run, or a tool missing inside a working php.
 */
export function describeFailure(error, binary) {
  if (error?.code === 'ENOENT') {
    return {
      status: 1,
      message:
        `\`${binary}\` is not on PATH, so the command could not start.\n` +
        'Bring the Docker stack up with `npm run dev`, or provision a native\n' +
        'PHP and MariaDB with `npm run websession:init` (web session).',
    };
  }

  return { status: Number.isInteger(error?.status) ? error.status : 1, message: null };
}

const NO_TARGET =
  'There is no PHP to run this with: the compose `php` service is not running\n' +
  'and there is no `php` on PATH. Run `npm run dev` first (or\n' +
  '`npm run websession:init` in a Claude Code web session).';

const STARTING =
  'The compose `php` service is still installing api/vendor. Wait until\n' +
  '`docker compose ps php` shows it healthy, then run this again.';

function exitWith(error, binary) {
  const { status, message } = describeFailure(error, binary);
  if (message) console.error(message);
  process.exit(status);
}

/**
 * Run `argv` (e.g. ['php', 'artisan', 'test']) with `cwd` relative to the
 * repository root and `env` added to the environment, wherever phpTarget()
 * says. Never throws: a failure exits this process with the command's status,
 * after printing a sentence only when nothing ran at all.
 *
 * `nativeEnv` is added on the native branch only, for a value the container's
 * .env already gets right (tools/phpunit.mjs's DB_HOST).
 */
export function runPhp(argv, { cwd = '.', env = {}, nativeEnv = {} } = {}) {
  const target = phpTarget();

  if (target === 'container') {
    const workdir = cwd === '.' ? CONTAINER_ROOT : `${CONTAINER_ROOT}/${cwd}`;
    // A TTY only when there is one to give: lint-staged, CI and pipes have
    // none, and `exec` without -T then refuses to start. With one, PHPUnit and
    // Pint keep their colours.
    const tty = process.stdin.isTTY && process.stdout.isTTY ? [] : ['-T'];
    const envFlags = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    try {
      execFileSync('docker', ['compose', 'exec', ...tty, '-w', workdir, ...envFlags, SERVICE, ...argv], {
        stdio: 'inherit',
      });
    } catch (error) {
      exitWith(error, 'docker');
    }
    return;
  }

  if (target === 'native') {
    try {
      execFileSync(argv[0], argv.slice(1), {
        cwd,
        stdio: 'inherit',
        env: { ...process.env, ...nativeEnv, ...env },
      });
    } catch (error) {
      exitWith(error, argv[0]);
    }
    return;
  }

  console.error(target === 'starting' ? STARTING : NO_TARGET);
  process.exit(1);
}

/** The pass-throughs: which binary each runs, and from which directory. */
const COMMANDS = {
  php: { argv: ['php'], cwd: '.' },
  artisan: { argv: ['php', 'artisan'], cwd: 'api' },
  composer: { argv: ['composer'], cwd: 'api' },
};

function main([name, ...args]) {
  const command = COMMANDS[name];
  if (!command) {
    console.error(`Usage: node tools/php-runner.mjs <${Object.keys(COMMANDS).join('|')}> [args...]`);
    process.exit(1);
  }
  runPhp([...command.argv, ...args], { cwd: command.cwd });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2));
}
