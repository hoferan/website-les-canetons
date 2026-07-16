// Runs PHPUnit inside php:8.1-cli (Docker), matching prod PHP. Requires
// `npm run php:install` first (installs vendor/, incl. PHPUnit).
import { runInPhp } from './php-in-docker.mjs';

runInPhp('php vendor/bin/phpunit');
