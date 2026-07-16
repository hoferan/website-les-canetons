// lint-staged entry for staged .php files: `php -l` each + phpcs, in one
// php:8.1-cli container. Receives absolute paths; converts to repo-relative.
import { relative } from 'node:path';
import { runInPhp } from './php-in-docker.mjs';

const files = process.argv.slice(2).map((f) => relative(process.cwd(), f).split('\\').join('/'));
if (files.length === 0) process.exit(0);

const quoted = files.map((f) => `'${f}'`).join(' ');
const script = [
  `for f in ${quoted}; do php -l "$f" >/dev/null || exit 1; done`,
  `php vendor/squizlabs/php_codesniffer/bin/phpcs --standard=phpcs.xml ${quoted}`,
].join(' && ');

try {
  runInPhp(script);
} catch {
  process.exit(1);
}
