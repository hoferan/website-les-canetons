// Installs api/vendor at most once, however many tools ask for it at once.
//
// WHY IT EXISTS. Four entry points each self-heal a missing api/vendor, and
// none of them knew about the others:
//
//   tools/ensure-dev-stack.sh  --prefer-source   npm run websession:init
//   tools/pint.mjs             --no-scripts      lint:api, AND every git commit
//   tools/phpstan.mjs          with scripts      lint:types
//   tools/openapi.mjs          --no-scripts      npm run openapi
//
// On a Claude Code web session that install takes minutes rather than seconds,
// because it runs from git sources (see docs/web-session.md), so two of them
// overlapping is ordinary rather than unlucky — and one of the triggers is
// COMMITTING, which is exactly what happens in the middle of a task. MEASURED
// 2026-09-16: provisioning and a pre-commit Pint ran together, wrote the same
// vendor tree and the same Composer VCS mirror, took that mirror to 15 GB
// against a documented 3 GB, and finished with no autoload.php at all. Killing
// one left its `git fetch` orphaned and still writing, which is the same
// failure a second time.
//
// The lock is a DIRECTORY, because mkdir is atomic on every filesystem this
// project runs on — Linux, macOS and Windows alike — while "check then create"
// is not. The holder's pid goes inside it so a lock left by a killed process
// can be taken over rather than wedging every later run forever.
//
// A waiter RE-CHECKS THE MARKER rather than queueing its own install: the point
// is one install, not installs in an orderly line. Waiting for five minutes and
// then doing the work again is the same wasted session, just tidier.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Repo-root relative, and git-ignored. Every caller shares this one lock. */
export const LOCK_DIR = '.api-vendor-install.lock';

const POLL_MS = 2_000;

/**
 * Long enough for a from-source install on a web session (the slowest path
 * there is, measured at 5-10 minutes), short enough that a wedged lock is
 * eventually reported rather than hung on until the session ends.
 */
const TIMEOUT_MS = 20 * 60_000;

/** Signal 0 tests for existence; EPERM means alive but owned by somebody else. */
function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** A blocking sleep, because every caller of this module is synchronous. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runComposer(args) {
  execFileSync(process.execPath, ['tools/composer.mjs', ...args], { stdio: 'inherit' });
}

/** The holder's pid, or null when the lock is malformed or being torn down. */
function holderPid(lockDir) {
  try {
    const pid = Number.parseInt(readFileSync(join(lockDir, 'pid'), 'utf8').trim(), 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Make sure api/vendor carries `marker`, installing it if it does not.
 *
 * @returns 'present'             nothing to do
 *          'installed'           this process ran the install
 *          'installed-elsewhere' another process finished it while we waited
 */
export function ensureApiVendor({
  marker,
  args,
  label,
  lockDir = LOCK_DIR,
  install = runComposer,
  log = console.log,
  isAlive = pidIsAlive,
  wait = sleepSync,
  now = Date.now,
  timeoutMs = TIMEOUT_MS,
  pollMs = POLL_MS,
}) {
  if (existsSync(marker)) return 'present';

  const deadline = now() + timeoutMs;
  let announced = false;

  for (;;) {
    try {
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, 'pid'), String(process.pid));
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      // Somebody else is installing. If they have finished, we are done.
      if (existsSync(marker)) return 'installed-elsewhere';

      const holder = holderPid(lockDir);
      if (holder !== null && !isAlive(holder)) {
        log(`${label}: process ${holder} left an install lock behind and is gone — taking it over`);
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }

      if (now() >= deadline) {
        throw new Error(
          `${label}: waited ${Math.round(timeoutMs / 60_000)} minutes for another process to finish ` +
            `installing api/vendor. If nothing is installing, delete ${lockDir} and try again.`
        );
      }

      if (!announced) {
        log(`${label}: another process is installing api/vendor — waiting for it rather than starting a second install`);
        announced = true;
      }

      wait(pollMs);
      if (existsSync(marker)) return 'installed-elsewhere';
    }
  }

  try {
    // Won the lock, but the previous holder may have installed what we need
    // between our last check and our mkdir.
    if (existsSync(marker)) return 'installed-elsewhere';

    install(args);
    return 'installed';
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}
