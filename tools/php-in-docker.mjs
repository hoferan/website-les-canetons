// Runs a shell command inside a php:8.1-cli container with the repo mounted
// at /app. Lets the project lint PHP without a local PHP install — the
// container matches production (PHP 8.1). Requires Docker to be running.
import { execFileSync } from 'node:child_process';

// Forward slashes so the bind mount works on Windows Docker Desktop too.
const mount = process.cwd().split('\\').join('/');

export function runInPhp(shellCommand) {
  execFileSync(
    'docker',
    ['run', '--rm', '-v', `${mount}:/app`, '-w', '/app', 'php:8.1-cli', 'sh', '-c', shellCommand],
    { stdio: 'inherit' }
  );
}
