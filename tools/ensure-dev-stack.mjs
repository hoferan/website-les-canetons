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
  try {
    execFileSync('bash', [script], { stdio: 'inherit' });
  } catch (error) {
    // Exit with the script's own status and NOTHING ELSE. execFileSync throws,
    // and an uncaught throw here prints a Node stack trace that scrolls the
    // script's diagnosis — what to check when the git install fails, say —
    // off the screen.
    // The script has already said everything useful on stderr.
    process.exit(typeof error.status === 'number' ? error.status : 1);
  }
}
