// Runs Composer inside the official composer:2 container (repo mounted at
// /app) so no local Composer/PHP install is needed. Falls back to a local
// `composer` binary when no Docker daemon is reachable (e.g. Claude Code
// web sessions).
// Usage: node tools/composer.mjs install --no-interaction
import { execFileSync, execSync } from 'node:child_process';

const mount = process.cwd().split('\\').join('/');
const args = process.argv.slice(2);

function dockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!dockerAvailable()) {
  execFileSync('composer', args, { stdio: 'inherit' });
} else {
  execFileSync('docker', ['run', '--rm', '-v', `${mount}:/app`, '-w', '/app', 'composer:2', ...args], {
    stdio: 'inherit',
  });
}
