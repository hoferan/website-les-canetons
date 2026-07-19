// Runs a shell command inside a php:8.4-cli container with the repo mounted
// at /app, matching production (PHP 8.4). Falls back to a local `sh -c`
// when no Docker daemon is reachable (e.g. Claude Code web sessions, which
// have PHP/Composer installed natively but no Docker).
import { execFileSync, execSync } from 'node:child_process';

// Forward slashes so the bind mount works on Windows Docker Desktop too.
const mount = process.cwd().split('\\').join('/');

function dockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function runInPhp(shellCommand) {
  if (!dockerAvailable()) {
    execFileSync('sh', ['-c', shellCommand], { stdio: 'inherit' });
    return;
  }
  execFileSync(
    'docker',
    ['run', '--rm', '-v', `${mount}:/app`, '-w', '/app', 'php:8.4-cli', 'sh', '-c', shellCommand],
    { stdio: 'inherit' }
  );
}
