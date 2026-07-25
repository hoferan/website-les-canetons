// tools/deploy/state.mjs
// The server-side sync-state file: records what this tool has confirmed on the
// server (each deployed path -> {size, sha256 hash}). A routine deploy diffs
// the local build against this one small file instead of walking the whole
// remote tree, and it makes an aborted deploy resumable. A dotfile so the
// front-controller catch-all + .htaccess don't serve it; part of PROTECTED so
// it's never deleted. Format is unchanged from the previous tool, so an
// existing .sync-state.json on a server keeps working.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withRetry, reconnector } from './ftp.mjs';

export const STATE_FILE = '.sync-state.json';

// Assemble the state object written to the server. `entries` is
// Map<rel, {size, hash}>; `status` is 'in-progress' (checkpoint) or 'complete'.
export function buildState(environment, commit, entries, status) {
  const files = {};
  for (const [rel, e] of [...entries.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    files[rel] = e;
  }
  return { version: 1, environment, commit, updatedAt: new Date().toISOString(), status, files };
}

// Parse raw JSON into a state object, or null when it isn't one (malformed,
// or missing the `files` map).
export function parseState(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Download and parse the remote state file, or null if it isn't there / is
// unreadable (a brand-new environment, i.e. bootstrap). Best-effort with a
// light retry so a transient blip doesn't look like "no state" and trigger a
// full re-upload.
export async function downloadState(client, remoteRoot, accessOpts) {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-state-'));
  const tmp = path.join(tmpDir, STATE_FILE);
  try {
    try {
      await withRetry(() => client.downloadTo(tmp, `${remoteRoot}/${STATE_FILE}`), reconnector(client, accessOpts), {
        retries: 2,
      });
    } catch {
      return null;
    }
    return parseState(readFileSync(tmp, 'utf8'));
  } catch {
    return null;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

// Write the state file to the server root (resilient; restores cwd on
// reconnect via ensureDir).
export async function uploadState(client, remoteRoot, accessOpts, state) {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-state-'));
  const tmp = path.join(tmpDir, STATE_FILE);
  try {
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    await withRetry(
      async () => {
        await client.ensureDir(remoteRoot);
        await client.uploadFrom(tmp, STATE_FILE);
      },
      reconnector(client, accessOpts)
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
