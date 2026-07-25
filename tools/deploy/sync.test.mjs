// tools/deploy/sync.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseConcurrency,
  groupByDir,
  classify,
  classifyWithList,
  brakeTrips,
  diffSizes,
  emptyDirsAfterDelete,
  deepestFirst,
} from './sync.mjs';

// Build a local-entries Map<rel,{size,hash}> from a compact {rel: [size, hash]} spec.
const entries = (spec) => new Map(Object.entries(spec).map(([rel, [size, hash]]) => [rel, { size, hash }]));
const PROT = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd', '.sync-state.json']);

test('parseConcurrency: default 6 when absent/invalid', () => {
  assert.equal(parseConcurrency(undefined), 6);
  assert.equal(parseConcurrency('abc'), 6);
  assert.equal(parseConcurrency(''), 6);
});

test('parseConcurrency: clamps to 1..8', () => {
  assert.equal(parseConcurrency('0'), 1);
  assert.equal(parseConcurrency('-5'), 1);
  assert.equal(parseConcurrency('3'), 3);
  assert.equal(parseConcurrency('99'), 8);
});

test('groupByDir: groups by posix parent, "." for root-level files', () => {
  const g = groupByDir([{ rel: 'a.txt' }, { rel: 'sub/b.txt' }, { rel: 'sub/c.txt' }, { rel: 'x/y/d.txt' }]);
  assert.deepEqual([...g.keys()].sort(), ['.', 'sub', 'x/y']);
  assert.equal(g.get('sub').length, 2);
});

test('classify: new / changed / unchanged / stale by hash', () => {
  const local = entries({
    'keep.js': [10, 'h-keep'], // same hash -> unchanged
    'edit.js': [20, 'h-new'], // hash differs -> changed
    'brand-new.js': [30, 'h-bn'], // absent from state -> new
  });
  const remoteFiles = {
    'keep.js': { size: 10, hash: 'h-keep' },
    'edit.js': { size: 20, hash: 'h-old' },
    'gone.js': { size: 40, hash: 'h-gone' }, // absent from local -> stale
  };
  const r = classify(local, remoteFiles, PROT);
  assert.deepEqual(r.newFiles.map((f) => f.rel), ['brand-new.js']);
  assert.deepEqual(r.changed.map((f) => f.rel), ['edit.js']);
  assert.equal(r.unchanged, 1);
  assert.deepEqual(r.stale, ['gone.js']);
});

test('classify: null state treats everything as new, nothing stale', () => {
  const r = classify(entries({ 'a.js': [1, 'h'] }), null, PROT);
  assert.deepEqual(r.newFiles.map((f) => f.rel), ['a.js']);
  assert.equal(r.unchanged, 0);
  assert.deepEqual(r.stale, []);
});

test('classify: never marks a protected file stale', () => {
  const remoteFiles = { '.htaccess': { size: 1, hash: 'h' }, 'config.php': { size: 2, hash: 'h' } };
  const r = classify(entries({}), remoteFiles, PROT);
  assert.deepEqual(r.stale, []);
});

test('classifyWithList: bootstrap (no state) re-uploads every present file', () => {
  const local = entries({ 'a.js': [1, 'ha'], 'b.js': [2, 'hb'] });
  const remoteSizes = new Map([
    ['a.js', 1],
    ['old.js', 9],
  ]);
  const r = classifyWithList(local, remoteSizes, null, PROT);
  // a.js exists on server but no hash record -> changed; b.js not on server -> new
  assert.deepEqual(r.newFiles.map((f) => f.rel), ['b.js']);
  assert.deepEqual(r.changed.map((f) => f.rel), ['a.js']);
  assert.equal(r.unchanged, 0);
  assert.deepEqual(r.stale, ['old.js']);
});

test('classifyWithList: unchanged needs matching hash AND matching server size (drift)', () => {
  const local = entries({ 'clean.js': [10, 'h1'], 'drift.js': [20, 'h2'] });
  const remoteSizes = new Map([
    ['clean.js', 10], // size matches
    ['drift.js', 999], // size differs from local 20 -> drift -> changed
  ]);
  const remoteFiles = {
    'clean.js': { size: 10, hash: 'h1' },
    'drift.js': { size: 20, hash: 'h2' }, // state hash matches, but server size drifted
  };
  const r = classifyWithList(local, remoteSizes, remoteFiles, PROT);
  assert.equal(r.unchanged, 1); // clean.js
  assert.deepEqual(r.changed.map((f) => f.rel), ['drift.js']);
  assert.deepEqual(r.newFiles, []);
});

test('classifyWithList: never marks a protected file stale', () => {
  const remoteSizes = new Map([
    ['.htaccess', 1],
    ['sub/config.php', 2],
    ['junk.js', 3],
  ]);
  const r = classifyWithList(entries({}), remoteSizes, null, PROT);
  assert.deepEqual(r.stale, ['junk.js']);
});

test('brakeTrips: needs BOTH >50 files AND >20% of remote', () => {
  assert.equal(brakeTrips(50, 100), false); // not >50
  assert.equal(brakeTrips(51, 100), true); // 51 > 50 and 51 > 20
  assert.equal(brakeTrips(51, 1000), false); // 51 <= 200 (20%)
  assert.equal(brakeTrips(300, 1000), true);
  assert.equal(brakeTrips(0, 0), false);
  assert.equal(brakeTrips(201, 1000), true); // 201 > 200
  assert.equal(brakeTrips(200, 1000), false); // exactly 20% does not trip
});

test('diffSizes: ok when every uploaded file matches the remote size', () => {
  const r = diffSizes(
    [{ rel: 'a', size: 1 }, { rel: 'b', size: 2 }],
    new Map([
      ['a', 1],
      ['b', 2],
    ])
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.mismatched, []);
});

test('diffSizes: reports missing and mismatched uploads, ignores unrelated remote files', () => {
  const r = diffSizes(
    [{ rel: 'gone', size: 5 }, { rel: 'short', size: 100 }],
    new Map([
      ['short', 42],
      ['unrelated', 7],
    ])
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['gone']);
  assert.deepEqual(r.mismatched, [{ rel: 'short', local: 100, remote: 42 }]);
});

test('emptyDirsAfterDelete: dir with only deleted files is listed', () => {
  assert.deepEqual(emptyDirsAfterDelete(['old/a.js', 'old/b.js'], ['old/a.js', 'old/b.js', 'keep/c.js']), ['old']);
});

test('emptyDirsAfterDelete: dir with a surviving file is NOT listed', () => {
  assert.deepEqual(emptyDirsAfterDelete(['mix/old.js'], ['mix/old.js', 'mix/keep.js']), []);
});

test('emptyDirsAfterDelete: nested empties come deepest-first', () => {
  assert.deepEqual(emptyDirsAfterDelete(['a/b/c/x.js', 'a/b/c/y.js'], ['a/b/c/x.js', 'a/b/c/y.js']), ['a/b/c', 'a/b', 'a']);
});

test('emptyDirsAfterDelete: partial nesting keeps the surviving ancestor', () => {
  // a/b/c and a/b become empty; a survives (has keep.js)
  assert.deepEqual(emptyDirsAfterDelete(['a/b/c/x.js'], ['a/b/c/x.js', 'a/keep.js']), ['a/b/c', 'a/b']);
});

test('emptyDirsAfterDelete: root-level deletions yield no dirs', () => {
  assert.deepEqual(emptyDirsAfterDelete(['x.js'], ['x.js', 'y.js']), []);
});

test('deepestFirst: children precede parents; same depth by name; dedupes', () => {
  assert.deepEqual(deepestFirst(['a', 'a/b/c', 'a/b', 'x/y']), ['a/b/c', 'a/b', 'x/y', 'a']);
  assert.deepEqual(deepestFirst(['z/a', 'm/b', 'q/c', 'm/b']), ['m/b', 'q/c', 'z/a']);
  assert.deepEqual(deepestFirst([]), []);
});
