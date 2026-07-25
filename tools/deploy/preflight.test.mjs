// tools/deploy/preflight.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROTECTED,
  TARGETS,
  checkTargetDir,
  configKeyPathsFromSource,
  compareConfigShape,
} from './preflight.mjs';

test('PROTECTED: server-owned files plus the tool-owned state file', () => {
  for (const name of ['.htaccess', 'robots.txt', 'config.php', '.htpasswd', '.sync-state.json']) {
    assert.ok(PROTECTED.has(name), `${name} must be protected`);
  }
});

test('TARGETS: exactly test/qa/prod', () => {
  assert.deepEqual(TARGETS, ['test', 'qa', 'prod']);
});

test('checkTargetDir: accepts paths that name the env as a path/subdomain segment', () => {
  assert.equal(checkTargetDir('test', '/www/test.lescanetons.ch').ok, true);
  assert.equal(checkTargetDir('qa', 'sites/qa.lescanetons.ch/web').ok, true);
  assert.equal(checkTargetDir('prod', '/www/prod/htdocs').ok, true);
});

test('checkTargetDir: refuses a dir that does not name the env (wrong-env protection)', () => {
  const r = checkTargetDir('test', '/www/qa.lescanetons.ch');
  assert.equal(r.ok, false);
  assert.match(r.message, /Refusing to run/);
  assert.match(r.message, /TEST/);
});

test('checkTargetDir: does not match the env name inside a longer word', () => {
  assert.equal(checkTargetDir('test', '/www/contest.example.ch').ok, false);
});

test('configKeyPathsFromSource: flattens nested arrays to sorted dotted paths', () => {
  const src = `<?php return ['db' => ['host' => 'x', 'name' => 'y'], 'env' => 'dev', 'list' => [1, 2]];`;
  assert.deepEqual(configKeyPathsFromSource(src, 'sample'), ['db.host', 'db.name', 'env', 'list.0', 'list.1']);
});

test('configKeyPathsFromSource: throws on non-literal keys instead of under-reporting', () => {
  assert.throws(() => configKeyPathsFromSource(`<?php return [FOO => 1];`, 'sample'), /Unsupported config key/);
});

test('configKeyPathsFromSource: throws when there is no top-level return array', () => {
  assert.throws(() => configKeyPathsFromSource(`<?php $a = 1;`, 'sample'), /expected a top-level/);
  assert.throws(() => configKeyPathsFromSource(`<?php return getConfig();`, 'sample'), /not an array literal/);
});

test('compareConfigShape: reports missing and extra keys', () => {
  const r = compareConfigShape(['a', 'b', 'c'], ['a', 'c', 'd']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['b']);
  assert.deepEqual(r.extra, ['d']);
});

test('compareConfigShape: ok when shapes match exactly', () => {
  const r = compareConfigShape(['a', 'b'], ['a', 'b']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
});
