// tools/deploy/cli.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PREBUILT_REQUIRED, missingFromPrebuilt, parseArgs } from './cli.mjs';

test('parseArgs: requires a valid target', () => {
  assert.match(parseArgs([]).error, /Usage:/);
  assert.match(parseArgs(['staging']).error, /Usage:/);
});

test('parseArgs: bare target yields all flags off', () => {
  const r = parseArgs(['test']);
  assert.equal(r.error, undefined);
  assert.equal(r.target, 'test');
  assert.deepEqual(
    [r.dryRun, r.force, r.forceDelete, r.relist, r.noDelete, r.verbose, r.status, r.prebuilt],
    [false, false, false, false, false, false, false, false]
  );
});

test('parseArgs: maps every known flag', () => {
  const r = parseArgs([
    'qa',
    '--dry-run',
    '--force',
    '--force-delete',
    '--relist',
    '--no-delete',
    '--verbose',
    '--status',
    '--prebuilt',
  ]);
  assert.equal(r.target, 'qa');
  assert.deepEqual(
    [r.dryRun, r.force, r.forceDelete, r.relist, r.noDelete, r.verbose, r.status, r.prebuilt],
    [true, true, true, true, true, true, true, true]
  );
});

function prebuiltTree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'prebuilt-'));
  for (const rel of files) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, '');
  }
  return root;
}

test('missingFromPrebuilt: a complete tree is missing nothing', () => {
  const root = prebuiltTree([...PREBUILT_REQUIRED.filter((p) => p !== '_api/vendor'), '_api/vendor/autoload.php']);
  try {
    assert.deepEqual(missingFromPrebuilt(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missingFromPrebuilt: names the authorization files a dotfile-dropping transfer loses', () => {
  // actions/upload-artifact leaves out dotfiles unless told otherwise, and
  // these two are the boundary around the Laravel tree.
  const root = prebuiltTree(['index.html', '_api/public/index.php', '_api/vendor/autoload.php']);
  try {
    assert.deepEqual(missingFromPrebuilt(root), ['_api/.htaccess', '_api/public/.htaccess']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missingFromPrebuilt: an absent tree is missing everything', () => {
  assert.deepEqual(missingFromPrebuilt(path.join(tmpdir(), 'no-such-prebuilt-tree')), PREBUILT_REQUIRED);
});

test('parseArgs: rejects unknown flags and extra positionals', () => {
  assert.match(parseArgs(['test', '--prune']).error, /Unknown flag: --prune/);
  assert.match(parseArgs(['test', 'qa']).error, /Unexpected argument: qa/);
});
