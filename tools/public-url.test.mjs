// No string in the SPA's code may name a web/public/ file by a root-absolute
// path. "/assets/img/x.png" works on every server, which serve the app from
// the document root, and 404s on a PR preview, which serves it from
// /website-les-canetons/pr-<n>/ (#353). Nothing else would notice: the
// screenshots and e2e run at the root too. web/src/publicUrl.ts is the way.
//
// Tests are exempt, since asserting the rendered src is their job.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = 'web/src';
const SKIP = [/\.test\.tsx?$/, /^api\/generated\//];
const ROOT_ABSOLUTE = /["'`]\/assets\//;

export function offenders(root = ROOT) {
  const found = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (SKIP.some((pattern) => pattern.test(relative))) continue;

    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (ROOT_ABSOLUTE.test(line)) found.push(`${ROOT}/${relative}:${index + 1}: ${line.trim()}`);
      });
  }
  return found;
}

test('the SPA names web/public/ files through publicUrl(), never by a root-absolute path', () => {
  assert.deepEqual(offenders(), [], 'Use publicUrl("assets/…") from web/src/publicUrl.ts.');
});
