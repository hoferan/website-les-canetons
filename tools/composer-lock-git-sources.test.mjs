// tools/composer-lock-git-sources.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deriveGitSource, addGitSources, patchLockFile } from './composer-lock-git-sources.mjs';

/** The real shape of the one package this exists for. */
const phpstan = () => ({
  name: 'phpstan/phpstan',
  version: '2.2.13',
  dist: {
    type: 'zip',
    url: 'https://api.github.com/repos/phpstan/phpstan/zipball/9ba9ac76ee9c5cf5b56d58eb5deec6315b7a0260',
    reference: '9ba9ac76ee9c5cf5b56d58eb5deec6315b7a0260',
    shasum: '',
  },
});

test('deriveGitSource: reads owner, repo and commit out of a zipball URL', () => {
  assert.deepEqual(deriveGitSource(phpstan()), {
    type: 'git',
    url: 'https://github.com/phpstan/phpstan.git',
    reference: '9ba9ac76ee9c5cf5b56d58eb5deec6315b7a0260',
  });
});

test('deriveGitSource: leaves a package that already has a source alone', () => {
  const pkg = { ...phpstan(), source: { type: 'git', url: 'https://example.invalid/x.git', reference: 'abc' } };
  assert.equal(deriveGitSource(pkg), null);
});

test('deriveGitSource: prefers the dist reference over the URL commit', () => {
  const pkg = phpstan();
  pkg.dist.reference = 'ffffffffffffffffffffffffffffffffffffffff';
  assert.equal(deriveGitSource(pkg).reference, 'ffffffffffffffffffffffffffffffffffffffff');
});

test('deriveGitSource: falls back to the URL commit when the reference is empty', () => {
  const pkg = phpstan();
  pkg.dist.reference = '';
  assert.equal(deriveGitSource(pkg).reference, '9ba9ac76ee9c5cf5b56d58eb5deec6315b7a0260');
});

test('deriveGitSource: ignores a dist that is not a GitHub zipball', () => {
  const pkg = phpstan();
  pkg.dist.url = 'https://example.invalid/phpstan-2.2.13.zip';
  assert.equal(deriveGitSource(pkg), null);
});

test('deriveGitSource: tolerates a package with no dist at all', () => {
  assert.equal(deriveGitSource({ name: 'a/b' }), null);
  assert.equal(deriveGitSource(null), null);
});

test('addGitSources: patches both packages and packages-dev, and names what changed', () => {
  const lock = {
    packages: [{ name: 'a/prod', dist: { url: 'https://api.github.com/repos/a/prod/zipball/aaaaaaa', reference: 'aaaaaaa' } }],
    'packages-dev': [phpstan()],
  };

  assert.deepEqual(addGitSources(lock), ['a/prod', 'phpstan/phpstan']);
  assert.equal(lock.packages[0].source.url, 'https://github.com/a/prod.git');
  assert.equal(lock['packages-dev'][0].source.url, 'https://github.com/phpstan/phpstan.git');
});

test('addGitSources: a lock whose packages all have sources is untouched', () => {
  const lock = {
    packages: [{ name: 'a/b', source: { type: 'git', url: 'https://github.com/a/b.git', reference: 'a' }, dist: { url: 'https://api.github.com/repos/a/b/zipball/a' } }],
  };
  assert.deepEqual(addGitSources(lock), []);
});

test('addGitSources: tolerates a lock with no packages-dev', () => {
  const lock = { packages: [phpstan()] };
  assert.deepEqual(addGitSources(lock), ['phpstan/phpstan']);
});

test('patchLockFile: leaves content-hash untouched, so the lock stays valid', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lock-'));
  const lockPath = path.join(dir, 'composer.lock');
  writeFileSync(lockPath, JSON.stringify({ 'content-hash': 'deadbeef', packages: [phpstan()] }, null, 4));

  patchLockFile(lockPath);

  const written = JSON.parse(readFileSync(lockPath, 'utf8'));
  assert.equal(written['content-hash'], 'deadbeef');
  assert.equal(written.packages[0].source.url, 'https://github.com/phpstan/phpstan.git');
});

test('patchLockFile: does not rewrite a file it had nothing to add to', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lock-'));
  const lockPath = path.join(dir, 'composer.lock');
  const original = '{"packages":[]}';
  writeFileSync(lockPath, original);

  assert.deepEqual(patchLockFile(lockPath), []);
  assert.equal(readFileSync(lockPath, 'utf8'), original);
});
