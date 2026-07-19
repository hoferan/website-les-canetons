// Minimal .env loader (no dependency): reads KEY=VALUE lines from a git-ignored
// .env into process.env without overwriting already-set vars. Shared by the
// deploy script (tools/deploy.mjs) and the overlay builder (build-overlays.mjs).
import { existsSync, readFileSync } from 'node:fs';

export function loadDotEnv(file = '.env') {
  if (!existsSync(file)) {
    return;
  }
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) {
      continue;
    }
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) {
      continue;
    }
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
