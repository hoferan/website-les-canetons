// Runs Composer inside the official composer:2 container (repo mounted at
// /app) so no local Composer/PHP install is needed.
// Usage: node tools/composer.mjs install --no-interaction
import { execFileSync } from 'node:child_process';

const mount = process.cwd().split('\\').join('/');
const args = process.argv.slice(2);

execFileSync('docker', ['run', '--rm', '-v', `${mount}:/app`, '-w', '/app', 'composer:2', ...args], {
  stdio: 'inherit',
});
