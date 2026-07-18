// Cross-platform, on-demand entry point for the native dev stack.
//
// Runs tools/ensure-dev-stack.sh only on a Docker-less Claude Code web session
// (CLAUDE_CODE_REMOTE=true and no reachable Docker daemon); a no-op everywhere
// else — local Docker dev, CI, and Windows provision the DB via docker compose
// or service containers instead. Wired into the DB-dependent npm scripts so
// provisioning happens when a tool needs the DB, not at session start.
import { execFileSync, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function dockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (process.env.CLAUDE_CODE_REMOTE === 'true' && !dockerAvailable()) {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'ensure-dev-stack.sh');
  execFileSync('bash', [script], { stdio: 'inherit' });
}
