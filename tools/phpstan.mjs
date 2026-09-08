// Runs Larastan (PHPStan for Laravel) over the API tree (api/).
//
// WHY IT EXISTS. Pint is a formatter, not an analyser: it will happily format
// a null dereference. Nothing read this code for correctness until 2026-09-08,
// which is how `$this->route('member')->id` in UpdateMemberRequest shipped —
// it surfaced only as a PHPUnit *warning* that a full-suite run prints once and
// nobody reads. Larastan flags that class of bug before a test ever runs.
//
// Level 5, set in api/phpstan.neon with the reasoning for not going higher.
//
// Executes through runInPhp(), so it uses the php:8.4-cli container when a
// Docker daemon is reachable and falls back to the locally-installed php when
// it is not (Claude Code web sessions) — the same mechanism as pint.mjs and
// php-lint.mjs. It never talks to the compose stack, so it also works with the
// stack down.
//
// api/vendor/ lives in a Docker volume, never on the host, so the binary is
// usually absent here: install it on first use through the same Composer
// wrapper the rest of the tooling uses. Unlike Pint, Larastan BOOTS LARAVEL to
// understand models and facades, so --no-scripts is not passed — the autoload
// map and package discovery both have to be real.
//
// Usage: node tools/phpstan.mjs [extra phpstan args]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { runInPhp } from './php-in-docker.mjs';

const args = process.argv.slice(2);

if (!existsSync('api/vendor/bin/phpstan')) {
  console.log('phpstan: api/vendor missing — installing the Laravel API dev dependencies once...');
  execFileSync(
    process.execPath,
    ['tools/composer.mjs', 'install', '--working-dir=api', '--no-interaction', '--no-progress'],
    { stdio: 'inherit' }
  );
}

// --memory-limit: Larastan holds the whole framework's type graph, and the
// default 128M is not enough to finish this project's app/ + tests/.
try {
  runInPhp(
    `cd api && php vendor/bin/phpstan analyse --memory-limit=1G --no-progress ${args
      .map((a) => `'${a}'`)
      .join(' ')}`
  );
} catch {
  process.exit(1);
}
