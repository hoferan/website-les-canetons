// Runs Laravel Pint over the Laravel API tree (api/). phpcs.xml scopes only
// app/ — the old app — so api/ needs its own formatter gate; Pint is already
// an api/ dev dependency, and using that one (pinned by api/composer.lock)
// keeps local, CI and container runs on the exact same version.
//
// Executes through runInPhp(), so it uses the php:8.4-cli container when a
// Docker daemon is reachable and falls back to the locally-installed php when
// it is not (Claude Code web sessions) — the same mechanism as php-lint.mjs.
// It never talks to the compose stack, so it also works with the stack down.
//
// api/vendor/ lives in a Docker volume, never on the host, so the binary is
// usually absent here: install it on first use via the same Docker-or-local
// Composer wrapper the rest of the tooling uses. --no-scripts skips Laravel's
// post-autoload-dump `artisan package:discover`, which Pint doesn't need and
// which would boot the framework outside its container.
//
// Usage: node tools/pint.mjs [--test] [extra pint args]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { runInPhp } from './php-in-docker.mjs';

const args = process.argv.slice(2);

if (!existsSync('api/vendor/bin/pint')) {
  console.log('pint: api/vendor missing — installing the Laravel API dev dependencies once...');
  const install = ['install', '--working-dir=api', '--no-interaction', '--no-progress', '--no-scripts'];
  execFileSync(process.execPath, ['tools/composer.mjs', ...install], { stdio: 'inherit' });
}

// cd into api/ so Pint treats it as the project root (and would pick up an
// api/pint.json), exactly as running it inside the container does.
try {
  runInPhp(`cd api && php vendor/bin/pint ${args.map((a) => `'${a}'`).join(' ')}`);
} catch {
  process.exit(1);
}
