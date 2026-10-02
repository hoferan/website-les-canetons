// Runs Laravel Pint over the Laravel API tree (api/). Pint is an api/ dev
// dependency, and using that one (pinned by api/composer.lock) keeps local, CI
// and container runs on the exact same version.
//
// Executes through runPhp() (tools/php-runner.mjs): inside the compose `php`
// service when it is up, with the native php otherwise (Claude Code web
// sessions, CI).
//
// On the native branch api/vendor is the host's own, so the binary may be
// absent: install it on first use through the shared Composer wrapper.
// --no-scripts skips Laravel's post-autoload-dump `artisan package:discover`,
// which Pint doesn't need. In the container there is nothing to install: the
// service's entrypoint has already filled the api_vendor volume, and a host
// install would only write a second vendor/ that the volume then shadows.
//
// Usage: node tools/pint.mjs [--test] [extra pint args]
import { ensureApiVendor } from './api-vendor.mjs';
import { phpTarget, runPhp } from './php-runner.mjs';

const args = process.argv.slice(2);

// Through ensureApiVendor rather than straight to Composer, because this is
// the entry point a `git commit` reaches (Husky -> lint-staged -> pint-file),
// so it is the one most likely to collide with a provisioning run already
// under way. It waits for that install instead of starting a second one.
if (phpTarget() === 'native') {
  ensureApiVendor({
    marker: 'api/vendor/bin/pint',
    label: 'pint',
    args: ['install', '--working-dir=api', '--no-interaction', '--no-progress', '--no-scripts'],
  });
}

// From api/, so Pint treats it as the project root (and would pick up an
// api/pint.json).
runPhp(['php', 'vendor/bin/pint', ...args], { cwd: 'api' });
