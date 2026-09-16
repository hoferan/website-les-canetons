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
import { existsSync } from 'node:fs';

import { ensureApiVendor } from './api-vendor.mjs';
import { runInPhp } from './php-in-docker.mjs';

const args = process.argv.slice(2);

// NOT INSTALLED IN A WEB SESSION, and this exits 0 rather than failing.
//
// There the install runs from git sources, where phpstan/phpstan alone is
// 2.9 GB — a built phar across 857 tags — roughly half of what provisioning
// the API used to cost. tools/composer-websession.mjs therefore leaves it
// and larastan out, so the binary is simply absent and self-healing it here
// would reinstate the cost this is meant to remove.
//
// Exiting 0 keeps `npm run check` usable in the environment being optimised.
// The trade is real and deliberate: `check` is then green there WITHOUT having
// type-checked any PHP, so CI's lint-api job is the gate — it runs Larastan on
// every pull request and reports type errors as annotations on the diff.
// Anywhere else (a Docker host, CI, a developer's machine) this is unchanged.
if (process.env.CLAUDE_CODE_REMOTE === 'true' && !existsSync('api/vendor/bin/phpstan')) {
  console.log(
    'phpstan: not installed in a Claude Code web session — static analysis is gated by CI.\n' +
      '         See docs/web-session.md for why, and what runs here instead.'
  );
  process.exit(0);
}

// NOTE the missing --no-scripts, which is deliberate and explained above: the
// autoload map and package discovery both have to be real for Larastan.
ensureApiVendor({
  marker: 'api/vendor/bin/phpstan',
  label: 'phpstan',
  args: ['install', '--working-dir=api', '--no-interaction', '--no-progress'],
});

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
