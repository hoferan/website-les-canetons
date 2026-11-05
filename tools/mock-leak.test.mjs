import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertNoMockLeaks, findMockLeaks, MARKERS } from './mock-leak.mjs';

/** A fake build: index.html plus whatever files the test hands it. */
function build(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mock-leak-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><script src="/assets/index.js"></script>');
  writeFileSync(join(dir, 'assets', 'index.js'), 'console.log("app")');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

test('a build without the mocks is clean', () => {
  assert.deepEqual(findMockLeaks(build()), []);
  assert.doesNotThrow(() => assertNoMockLeaks(build()));
});

test('the worker script is a leak wherever it sits', () => {
  assert.deepEqual(findMockLeaks(build({ 'mockServiceWorker.js': '' })), [
    'mockServiceWorker.js: the MSW worker script',
  ]);
  assert.deepEqual(findMockLeaks(build({ 'assets/mockServiceWorker.js': '' })), [
    'assets/mockServiceWorker.js: the MSW worker script',
  ]);
});

for (const marker of MARKERS) {
  test(`a bundle containing ${marker} is a leak`, () => {
    const dir = build({ 'assets/chunk-abc123.js': `var a=1;"${marker}";` });
    assert.deepEqual(findMockLeaks(dir), [`assets/chunk-abc123.js: contains "${marker}"`]);
  });
}

test('only scripts and documents are read, so an image cannot trip it', () => {
  assert.deepEqual(findMockLeaks(build({ 'assets/photo.png': '[MSW]' })), []);
});

test('the error names every leak and where to look', () => {
  const dir = build({ 'mockServiceWorker.js': '', 'assets/x.js': '"msw:user"' });
  assert.throws(
    () => assertNoMockLeaks(dir),
    (error) =>
      error.message.includes('mockServiceWorker.js: the MSW worker script') &&
      error.message.includes('assets/x.js: contains "msw:user"') &&
      error.message.includes('web/src/main.tsx')
  );
});
