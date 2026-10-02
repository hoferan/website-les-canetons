// lint-staged entry for staged api/**/*.php files: runs Laravel Pint over
// exactly those files. Without it, `lint-staged`'s only PHP glob is
// app/**/*.php, so a commit touching the Laravel tree skipped the pre-commit
// hook entirely — `npm run check` and CI still caught it, just later.
//
// lint-staged hands this script ABSOLUTE host paths, which mean nothing inside
// the compose `php` service, so they are made relative first — relative to
// api/, because tools/pint.mjs runs Pint from there so it treats api/ as the
// project root (and would pick up an api/pint.json).
//
// Delegating to tools/pint.mjs rather than calling the runner directly is
// deliberate: that wrapper already carries the native branch's first-use
// `composer install` bootstrap. Reusing it keeps the hook,
// `npm run lint:api`/`fix:api` and CI on the one Pint version pinned by
// api/composer.lock.
//
// This WRITES rather than checks: Pint is a pure formatter and fixes
// everything it reports, so it follows the repo's other formatter entries
// (prettier --write, stylelint --fix) and lets lint-staged re-stage the result
// instead of failing a commit over whitespace. `npm run lint:api` keeps the
// check-only (--test) behaviour for `npm run check` and CI.
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const apiRoot = resolve('api');
const files = process.argv.slice(2).map((f) => relative(apiRoot, resolve(f)).split('\\').join('/'));
if (files.length === 0) process.exit(0);

try {
  execFileSync(process.execPath, ['tools/pint.mjs', ...files], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
