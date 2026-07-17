// Full PHP check: `php -l` over every code/**.php, then PHP_CodeSniffer,
// all in one php:8.1-cli container. `php -l` parse errors surface on stderr.
import { runInPhp } from './php-in-docker.mjs';

const script = [
  'fail=0',
  "for f in $(find app -name '*.php'); do",
  '  if ! php -l "$f" >/dev/null; then fail=1; fi',
  'done',
  '[ "$fail" -eq 0 ] || { echo "php -l: syntax errors above"; exit 1; }',
  'echo "php -l: OK"',
  'php vendor/squizlabs/php_codesniffer/bin/phpcs --standard=phpcs.xml',
].join('\n');

try {
  runInPhp(script);
} catch {
  process.exit(1);
}
