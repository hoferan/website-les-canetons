// Runs Composer under production's PHP: inside docker/php's image (repo mounted
// at /app, see tools/php-image.mjs), so no local Composer/PHP install is
// needed. Falls back to a local `composer` binary when no Docker daemon is
// reachable (e.g. Claude Code web sessions).
// Usage: node tools/composer.mjs install --no-interaction
import { execFileSync, execSync } from 'node:child_process';

import { composerRunArgs, ensurePhpImage } from './php-image.mjs';

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
  ensurePhpImage();
  execFileSync('docker', composerRunArgs({ mount, args }), { stdio: 'inherit' });
}
