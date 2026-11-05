// Fails a build of the SPA that would ship the mocked backend.
//
// web/src/main.tsx starts MSW's worker only in `npm run dev:mock` and in a PR
// preview (`vite build --mode preview`, #353). Both gates are literals in a
// build, so in `npm run build` the branch folds away and neither MSW nor the
// handlers are bundled. One careless edit to the gate would put a request
// interceptor, the demo logins and their password on the live site, with
// every test still green.
//
// tools/build.mjs runs this over dist/build/ after the SPA build, so CI's
// `build` job fails on a leak. Also runnable on its own:
//
//   node tools/mock-leak.mjs [dir]       (default: dist/build)
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The worker script, which Vite copies verbatim out of web/public/. */
export const WORKER_FILE = 'mockServiceWorker.js';

/**
 * Strings that survive minification, measured against both builds: present
 * in the preview bundle, absent from the production one. `[MSW]` prefixes
 * every message MSW logs, `mockServiceWorker` is how the bundle names its
 * worker, and `msw:user` is the mocked session's key in our own handlers.
 */
export const MARKERS = ['[MSW]', 'mockServiceWorker', 'msw:user'];

const SCANNED = new Set(['.js', '.html']);

/**
 * Every trace of the mocks under `dir`, as "<relative path>: <reason>" lines.
 * An empty list means the build is clean.
 */
export function findMockLeaks(dir) {
  const leaks = [];

  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;

    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(dir, file).split(path.sep).join('/');

    if (entry.name === WORKER_FILE) {
      leaks.push(`${relative}: the MSW worker script`);
      continue;
    }

    if (!SCANNED.has(path.extname(entry.name))) continue;

    const text = readFileSync(file, 'utf8');
    for (const marker of MARKERS) {
      if (text.includes(marker)) leaks.push(`${relative}: contains "${marker}"`);
    }
  }

  return leaks;
}

/** Throws, naming every leak, when `dir` carries any part of the mocks. */
export function assertNoMockLeaks(dir) {
  const leaks = findMockLeaks(dir);
  if (leaks.length > 0) {
    throw new Error(
      `${dir} ships the mocked backend, which must never reach a server:\n  ` +
        `${leaks.join('\n  ')}\n` +
        'Check the gate around the worker in web/src/main.tsx.'
    );
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const dir = process.argv[2] ?? 'dist/build';
  try {
    assertNoMockLeaks(dir);
    console.log(`${dir} carries no mocks.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
