// tools/deploy/state.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATE_FILE, buildState, parseState } from './state.mjs';

test('STATE_FILE is the dotfile name the server-side manifest uses', () => {
  assert.equal(STATE_FILE, '.sync-state.json');
});

test('buildState: assembles version/env/commit/status and sorts file keys', () => {
  const entries = new Map([
    ['z/last.js', { size: 2, hash: 'hz' }],
    ['a/first.js', { size: 1, hash: 'ha' }],
  ]);
  const s = buildState('test', 'abc1234', entries, 'in-progress');
  assert.equal(s.version, 1);
  assert.equal(s.environment, 'test');
  assert.equal(s.commit, 'abc1234');
  assert.equal(s.status, 'in-progress');
  assert.match(s.updatedAt, /^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  assert.deepEqual(Object.keys(s.files), ['a/first.js', 'z/last.js']);
  assert.deepEqual(s.files['a/first.js'], { size: 1, hash: 'ha' });
});

test('parseState: accepts a valid state object', () => {
  const s = parseState(JSON.stringify({ version: 1, files: { 'a.js': { size: 1, hash: 'h' } } }));
  assert.equal(s.files['a.js'].hash, 'h');
});

test('parseState: rejects malformed JSON and shapes without files', () => {
  assert.equal(parseState('not json at all'), null);
  assert.equal(parseState(JSON.stringify({ version: 1 })), null);
  assert.equal(parseState(JSON.stringify('a string')), null);
  assert.equal(parseState(JSON.stringify(null)), null);
});
