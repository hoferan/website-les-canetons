// tools/deploy/local.mjs
// Local-side inputs to a deploy: walk the built artifact, fingerprint every
// file (sha256 content hash — so change detection has no "same size, changed
// content" blind spot), and write the deployment.json marker that records
// which commit is deployed. Filesystem/git only — no FTP, no printing.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// The deployment marker, written into the build root on every deploy and
// web-readable at /deployment.json. Its deployedAt changes every run, so its
// hash always differs and it re-uploads naturally.
export const MARKER = 'deployment.json';

// Walk the build tree: [{rel, size}] with posix rel paths, sorted, excluding
// protected basenames (server-owned files must never even be candidates).
export function walkBuild(root, protectedSet) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!protectedSet.has(entry.name)) {
        out.push({ rel: path.relative(root, full).split(path.sep).join('/'), size: statSync(full).size });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// Fingerprint every file: Map<rel, {size, hash}> (sha256 of the bytes).
// Hashing ~7,000 build files is ~1-2s. `onProgress(done, total)` fires every
// `every` files so the UI can show a bar.
export function fingerprint(root, files, onProgress, every = 500) {
  const entries = new Map();
  let done = 0;
  for (const f of files) {
    const hash = createHash('sha256').update(readFileSync(path.join(root, f.rel))).digest('hex');
    entries.set(f.rel, { size: f.size, hash });
    done++;
    if (onProgress && done % every === 0) {
      onProgress(done, files.length);
    }
  }
  return entries;
}

// Write the deployment marker into the build root so each server records
// exactly which commit is deployed there. Values come from GitHub Actions env
// vars in CI, falling back to local git for hand-runs.
export function writeDeploymentMarker(environment, root) {
  const gitOr = (fallback, ...gitArgs) => {
    try {
      return execFileSync('git', gitArgs, { encoding: 'utf8' }).trim();
    } catch {
      return fallback;
    }
  };
  const commit = process.env.GITHUB_SHA || gitOr('local', 'rev-parse', 'HEAD');
  const shortCommit = process.env.GITHUB_SHA
    ? process.env.GITHUB_SHA.slice(0, 7)
    : gitOr('local', 'rev-parse', '--short', 'HEAD');
  const ref = process.env.GITHUB_REF_NAME || gitOr('', 'rev-parse', '--abbrev-ref', 'HEAD');
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const runUrl =
    GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : null;
  const marker = { environment, commit, shortCommit, ref, deployedAt: new Date().toISOString(), runUrl };
  writeFileSync(path.join(root, MARKER), `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
}
