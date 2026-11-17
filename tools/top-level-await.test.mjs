// No module the SPA ships may await at its top level.
//
// web/src/main.tsx is bundled into the visitor's chunk (vite.config.ts), and
// every chunk loaded on demand imports from that chunk. A module still
// awaiting at its top level has not finished evaluating, so a chunk it then
// imports, and which imports it back, waits for it while it waits for that
// chunk. Nothing throws: the page stays blank. Every PR preview did that
// after #476, because main.tsx awaited the mocks' chunk (#479). Production
// had the same trap waiting in its await of the German catalogue.
//
// So the boot runs in an async function, and this test keeps it there.
// Tests and their setup are exempt: Vitest runs them unbundled.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import ts from 'typescript';

const ROOT = 'web/src';
const SKIP = [
  /\.test\.tsx?$/,
  /\.stories\.tsx$/,
  /^test\//,
  /^setupTests\.ts$/,
  /^api\/generated\//,
];

/** The line of each top-level `await` (and `for await`) in a module's source. */
export function topLevelAwaits(source, fileName = 'module.tsx') {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const lines = [];
  const visit = (node) => {
    // A function's body is not the module's top level.
    if (ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node)) return;
    if (ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier)) {
      lines.push(file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

function offenders(root = ROOT) {
  const found = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (SKIP.some((pattern) => pattern.test(relative))) continue;
    for (const line of topLevelAwaits(readFileSync(file, 'utf8'), entry.name)) {
      found.push(`${ROOT}/${relative}:${line}`);
    }
  }
  return found;
}

test('topLevelAwaits finds an await outside any function, and only there', () => {
  assert.deepEqual(topLevelAwaits('await a();\nif (x) { const b = await c(); }\n'), [1, 2]);
  assert.deepEqual(topLevelAwaits('for await (const x of y) {}\n'), [1]);
  assert.deepEqual(
    topLevelAwaits(
      'async function f() { await a(); }\nconst g = async () => { await b(); };\nclass C { async m() { await d(); } }\n',
    ),
    [],
  );
});

test('no module the SPA ships awaits at its top level', () => {
  assert.deepEqual(
    offenders(),
    [],
    'Move the await into an async function, as web/src/main.tsx does with boot().',
  );
});
