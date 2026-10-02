// Runs the Laravel test suite, in Docker or natively, from one command.
//
// WHY IT EXISTS. The suite needs a live database, which is why `npm run check`
// leaves it out. Through runPhp() (tools/php-runner.mjs) it runs inside the
// compose `php` service when the stack is up, against the stack's own MariaDB
// 10.3, which is the version production runs; otherwise it runs with the
// native php of a Claude Code web session or a developer machine.
//
// THE ONE VARIABLE IS DB_HOST. api/phpunit.xml pins `DB_HOST=db`, the compose
// service name, which resolves inside the stack and nowhere else. PHPUnit's
// <env> entries do not overwrite a variable that is already set, so exporting
// DB_HOST=127.0.0.1 on the native branch is enough to point the same suite at
// a native MariaDB — no second phpunit.xml, no profile, no edit to the
// committed one. The container needs nothing: `db` resolves there.
//
// EVERY FAILURE GOES THROUGH describeFailure() in the runner, and none of them
// throws. execFileSync throws on any non-zero exit, so left alone a red suite
// would end in five frames of node:internal, on top of the test output that is
// the entire reason anyone ran it.
//
// Usage: node tools/phpunit.mjs [extra artisan test args]
//   node tools/phpunit.mjs --filter=AccountPasswordTest
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { phpTarget, runPhp } from './php-runner.mjs';

function main(args) {
  if (phpTarget() === 'native' && !existsSync('api/vendor/autoload.php')) {
    console.error(
      'api/vendor is not installed, so there is no test runner.\n' +
        'Run `npm run websession:init` (web session) or `npm run dev` (Docker) first.'
    );
    process.exit(1);
  }

  // Native: MariaDB is 10.11 from apt rather than production's 10.3 — see
  // tools/ensure-dev-stack.sh for why that matters for anything schema-shaped.
  runPhp(['php', 'artisan', 'test', ...args], {
    cwd: 'api',
    nativeEnv: { DB_HOST: process.env.DB_HOST ?? '127.0.0.1' },
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2));
}
