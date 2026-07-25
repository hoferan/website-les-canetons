// tools/deploy/local.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MARKER, walkBuild, fingerprint, writeDeploymentMarker } from './local.mjs';

// sha256("hello")
const HELLO_SHA = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'lc-local-'));
  writeFileSync(path.join(root, 'a.txt'), 'hello');
  mkdirSync(path.join(root, 'sub', 'deep'), { recursive: true });
  writeFileSync(path.join(root, 'sub', 'b.txt'), 'world');
  writeFileSync(path.join(root, 'sub', 'deep', 'c.txt'), '!');
  writeFileSync(path.join(root, '.htaccess'), 'server-owned');
  writeFileSync(path.join(root, 'sub', 'config.php'), 'server-owned');
  return root;
}

const PROT = new Set(['.htaccess', 'config.php']);

test('walkBuild: posix rel paths + sizes, sorted, protected basenames excluded at any depth', () => {
  const files = walkBuild(fixture(), PROT);
  assert.deepEqual(files, [
    { rel: 'a.txt', size: 5 },
    { rel: 'sub/b.txt', size: 5 },
    { rel: 'sub/deep/c.txt', size: 1 },
  ]);
});

test('fingerprint: sha256 content hashes keyed by rel path', () => {
  const root = fixture();
  const files = walkBuild(root, PROT);
  const entries = fingerprint(root, files);
  assert.equal(entries.size, 3);
  assert.deepEqual(entries.get('a.txt'), { size: 5, hash: HELLO_SHA });
  assert.match(entries.get('sub/b.txt').hash, /^[0-9a-f]{64}$/);
});

test('fingerprint: reports progress through the callback', () => {
  const root = fixture();
  const files = walkBuild(root, PROT);
  const seen = [];
  fingerprint(root, files, (done, total) => seen.push([done, total]), 1); // report every file
  assert.deepEqual(seen, [[1, 3], [2, 3], [3, 3]]);
});

test('writeDeploymentMarker: writes deployment.json with env/commit/time into the root', () => {
  const root = fixture();
  const marker = writeDeploymentMarker('test', root);
  const onDisk = JSON.parse(readFileSync(path.join(root, MARKER), 'utf8'));
  assert.equal(onDisk.environment, 'test');
  assert.equal(onDisk.commit, marker.commit);
  assert.ok(typeof marker.commit === 'string' && marker.commit.length > 0);
  assert.ok(typeof marker.shortCommit === 'string' && marker.shortCommit.length > 0);
  assert.match(onDisk.deployedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('writeDeploymentMarker: CI env vars take precedence and build runUrl', () => {
  const root = fixture();
  const saved = {};
  const vars = {
    GITHUB_SHA: 'abcdef0123456789abcdef0123456789abcdef01',
    GITHUB_REF_NAME: 'v2026-07-25',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'acme/website',
    GITHUB_RUN_ID: '12345',
  };
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    const marker = writeDeploymentMarker('qa', root);
    assert.equal(marker.commit, vars.GITHUB_SHA);
    assert.equal(marker.shortCommit, 'abcdef0');
    assert.equal(marker.ref, 'v2026-07-25');
    assert.equal(marker.runUrl, 'https://github.com/acme/website/actions/runs/12345');
    assert.equal(marker.environment, 'qa');
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
});
