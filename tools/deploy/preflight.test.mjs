// tools/deploy/preflight.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classify, classifyWithList } from './sync.mjs';
import { walkBuild } from './local.mjs';
import {
  PROTECTED_PATHS,
  TARGETS,
  checkTargetDir,
  envKeys,
  compareEnvShape,
} from './preflight.mjs';

test('PROTECTED_PATHS: the server-owned files, as ROOT-RELATIVE paths', () => {
  // Paths, not basenames. The basename form protected `.htaccess` at any
  // depth, which silently dropped `api/.htaccess` and `api/public/.htaccess`
  // — which ship as `_api/.htaccess` and `_api/public/.htaccess`
  // in the artifact this set actually matches against — from every upload for
  // the whole life of the project; the two files that were written to be the
  // authorization boundary around the Laravel tree.
  for (const rel of [
    '.htaccess',
    'robots.txt',
    'config.php',
    '.htpasswd',
    '_api/.env',
    '.sync-state.json',
  ]) {
    assert.ok(PROTECTED_PATHS.has(rel), `${rel} must be protected`);
  }
});

test('PROTECTED_PATHS: a bare .env is NOT protected — only the one in the API tree', () => {
  // There is no .env at the document root. Protecting the bare basename is
  // what caused the nested-file bug; asserting its absence is what stops a
  // future edit reintroducing it "for safety".
  assert.ok(!PROTECTED_PATHS.has('.env'));
});

test('PROTECTED_PATHS: the nested access files are NOT protected, so they deploy', () => {
  // The entire point of this change.
  assert.ok(!PROTECTED_PATHS.has('_api/.htaccess'));
  assert.ok(!PROTECTED_PATHS.has('_api/public/.htaccess'));
});

test('walkBuild: uploads a nested .htaccess and skips a protected root path', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lc-walk-'));
  try {
    mkdirSync(path.join(root, '_api', 'public'), { recursive: true });
    writeFileSync(path.join(root, '.htaccess'), 'root — server-owned');
    writeFileSync(path.join(root, 'index.html'), 'shell');
    writeFileSync(path.join(root, '_api', '.htaccess'), 'deny all');
    writeFileSync(path.join(root, '_api', 'public', '.htaccess'), 'grant');

    const rels = walkBuild(root, PROTECTED_PATHS).map((f) => f.rel);

    assert.ok(!rels.includes('.htaccess'), 'the root .htaccess is server-owned');
    assert.deepEqual(rels.sort(), [
      '_api/.htaccess',
      '_api/public/.htaccess',
      'index.html',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PROTECTED_PATHS: a --relist/bootstrap deploy never marks the API .env stale', () => {
  // _api/.env is Laravel's server-owned configuration (APP_KEY, DB
  // credentials, MIGRATE_TOKEN) and exists nowhere else. On an authoritative
  // run, deletion is grounded in the real remote tree, so an unprotected .env
  // would be classified stale and deleted.
  const local = new Map([['index.php', { size: 1, hash: 'a' }]]);
  const remoteSizes = new Map([
    ['index.php', 1],
    ['_api/.env', 900],
    ['_api/.env.example', 900],
    ['_api/storage/logs/laravel.log', 10],
  ]);

  const { stale } = classifyWithList(
    local,
    remoteSizes,
    { 'index.php': { size: 1, hash: 'a' } },
    PROTECTED_PATHS,
  );

  assert.ok(!stale.includes('_api/.env'), '_api/.env must never be deleted');
  // .env.example is NOT protected and does not travel in this fixture's local
  // set, so it is correctly stale here.
  assert.deepEqual(stale, [
    '_api/.env.example',
    '_api/storage/logs/laravel.log',
  ]);
});

test('PROTECTED_PATHS: the fast-path diff also spares the API .env', () => {
  const { stale } = classify(
    new Map([['index.php', { size: 1, hash: 'a' }]]),
    { 'index.php': { size: 1, hash: 'a' }, '_api/.env': { size: 900, hash: 'b' } },
    PROTECTED_PATHS,
  );

  assert.deepEqual(stale, []);
});

test('PROTECTED_PATHS: a same-named file at a different path is still deletable', () => {
  // The inverse of the bug. `storage/robots.txt` is not the server-owned
  // /robots.txt, and a basename match would have spared it forever.
  const { stale } = classify(
    new Map(),
    { 'robots.txt': { size: 1, hash: 'a' }, 'storage/robots.txt': { size: 1, hash: 'a' } },
    PROTECTED_PATHS,
  );

  assert.deepEqual(stale, ['storage/robots.txt']);
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

test('envKeys: reads keys, ignoring comments, blank lines and values', () => {
  const source = ['# a comment', '', 'APP_KEY=base64:secret', 'DB_HOST=127.0.0.1', '   ', 'APP_ENV=test'].join('\n');
  assert.deepEqual(envKeys(source), ['APP_ENV', 'APP_KEY', 'DB_HOST']);
});

test('envKeys: tolerates an export prefix, padding and CRLF', () => {
  assert.deepEqual(envKeys('export APP_KEY=x  \r\n  DB_HOST =y\r\n'), ['APP_KEY', 'DB_HOST']);
});

test('envKeys: a key with an empty value still counts as declared', () => {
  // A server sets MIGRATE_TOKEN= with no value far more often than it omits
  // the line; that is a value problem, not a shape problem, and this check
  // deliberately never looks at values.
  assert.deepEqual(envKeys('MIGRATE_TOKEN='), ['MIGRATE_TOKEN']);
});

test('envKeys: ignores a commented-out key', () => {
  assert.deepEqual(envKeys('# DB_HOST=1\nAPP_KEY=2'), ['APP_KEY']);
});

test('compareEnvShape: reports keys the code expects but the server lacks', () => {
  const r = compareEnvShape(['APP_KEY', 'DB_HOST', 'MIGRATE_TOKEN'], ['APP_KEY', 'DB_HOST']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['MIGRATE_TOKEN']);
  assert.deepEqual(r.extra, []);
});

test('compareEnvShape: reports keys the server has that the code no longer expects', () => {
  const r = compareEnvShape(['APP_KEY'], ['APP_KEY', 'OLD_FLAG']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, ['OLD_FLAG']);
});

test('compareEnvShape: ok when the key sets match, whatever the order', () => {
  const r = compareEnvShape(['A', 'B'], ['B', 'A']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
});
