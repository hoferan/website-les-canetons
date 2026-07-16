// Auto-fixes PHP to PSR-12 with phpcbf (inside php:8.1-cli). phpcbf exits
// non-zero when it successfully fixes files, so a throw here is expected —
// verify the result with `node tools/php-lint.mjs` afterwards.
import { runInPhp } from './php-in-docker.mjs';

try {
  runInPhp('php vendor/squizlabs/php_codesniffer/bin/phpcbf --standard=phpcs.xml');
} catch {
  // phpcbf returns 1 when it fixed something — not a failure for our purposes.
}
