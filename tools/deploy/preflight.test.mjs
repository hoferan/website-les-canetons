// tools/deploy/preflight.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, classifyWithList } from './sync.mjs';
import {
  PROTECTED,
  TARGETS,
  checkTargetDir,
  envKeys,
  compareEnvShape,
} from './preflight.mjs';

test('PROTECTED: server-owned files plus the tool-owned state file', () => {
  for (const name of ['.htaccess', 'robots.txt', 'config.php', '.htpasswd', '.env', '.sync-state.json']) {
    assert.ok(PROTECTED.has(name), `${name} must be protected`);
  }
});

// api-laravel/.env is Laravel's server-owned configuration (APP_KEY, DB
// credentials, MIGRATE_TOKEN, ALTCHA_HMAC_SECRET). tools/build.mjs strips it
// from the artifact, so it is never in localEntries — which makes it look
// exactly like a stale remote file. A routine state-based deploy never sees it
// (it isn't in the state file either), but --relist and the bootstrap deploy
// classify from the server's real tree, and would delete it. Deleting it is
// unrecoverable from the repo and takes the whole API down.
test('PROTECTED: a --relist/bootstrap deploy never marks api-laravel/.env stale', () => {
  const local = new Map([['index.php', { size: 1, hash: 'a' }]]);
  const remoteSizes = new Map([
    ['index.php', 1],
    ['api-laravel/.env', 900],
    ['api-laravel/.env.example', 900],
    ['api-laravel/storage/logs/laravel.log', 42],
  ]);
  const { stale } = classifyWithList(local, remoteSizes, { 'index.php': { size: 1, hash: 'a' } }, PROTECTED);
  assert.ok(!stale.includes('api-laravel/.env'), 'api-laravel/.env must never be deleted');
  // Only the real file is spared — a differently-named neighbour still goes.
  assert.deepEqual(stale, ['api-laravel/.env.example', 'api-laravel/storage/logs/laravel.log']);
});

test('PROTECTED: the fast-path diff also spares api-laravel/.env', () => {
  const { stale } = classify(
    new Map([['index.php', { size: 1, hash: 'a' }]]),
    { 'index.php': { size: 1, hash: 'a' }, 'api-laravel/.env': { size: 900, hash: 'b' } },
    PROTECTED
  );
  assert.deepEqual(stale, []);
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
