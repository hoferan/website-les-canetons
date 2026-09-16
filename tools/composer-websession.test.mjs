// tools/composer-websession.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { OMITTED, removePackages, removeDevRequires, patchProject } from './composer-websession.mjs';

const manifest = () => ({
  require: { php: '^8.4', 'laravel/framework': '^13.8' },
  'require-dev': { 'larastan/larastan': '^3.11', 'phpunit/phpunit': '^12.5.12' },
});

const lock = () => ({
  'content-hash': 'deadbeef',
  packages: [{ name: 'laravel/framework' }],
  'packages-dev': [
    { name: 'phpunit/phpunit' },
    { name: 'larastan/larastan', require: { 'phpstan/phpstan': '^2.0' } },
    { name: 'phpstan/phpstan' },
  ],
});

function project(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'composer-'));
  writeFileSync(path.join(dir, 'composer.json'), JSON.stringify(files.manifest, null, 4));
  writeFileSync(path.join(dir, 'composer.lock'), JSON.stringify(files.lock, null, 4));
  return dir;
}

test('OMITTED names the static-analysis pair and nothing else', () => {
  assert.deepEqual(OMITTED, ['larastan/larastan', 'phpstan/phpstan']);
});

test('removePackages: drops the omitted packages from the lock', () => {
  const l = lock();
  assert.deepEqual(removePackages(l), ['larastan/larastan', 'phpstan/phpstan']);
  assert.deepEqual(l['packages-dev'].map((p) => p.name), ['phpunit/phpunit']);
});

test('removePackages: never touches production packages', () => {
  const l = lock();
  removePackages(l);
  assert.deepEqual(l.packages.map((p) => p.name), ['laravel/framework']);
});

// THE HALF THAT WAS MISSING, and it cost a failed provisioning run to find:
// composer install refuses a lock that does not carry every require-dev entry
// of composer.json — "Required (in require-dev) package larastan/larastan is
// not present in the lock file". Dropping it from the lock alone is not enough.
test('removeDevRequires: drops the omitted names from composer.json require-dev', () => {
  const m = manifest();
  assert.deepEqual(removeDevRequires(m), ['larastan/larastan']);
  assert.deepEqual(Object.keys(m['require-dev']), ['phpunit/phpunit']);
});

test('removeDevRequires: never touches the production require block', () => {
  const m = manifest();
  removeDevRequires(m);
  assert.deepEqual(Object.keys(m.require), ['php', 'laravel/framework']);
});

test('removeDevRequires: tolerates a manifest with no require-dev', () => {
  assert.deepEqual(removeDevRequires({ require: {} }), []);
});

test('patchProject: patches both files and reports both halves', () => {
  const dir = project({ manifest: manifest(), lock: lock() });

  assert.deepEqual(patchProject(dir), {
    unrequired: ['larastan/larastan'],
    removed: ['larastan/larastan', 'phpstan/phpstan'],
  });

  const writtenLock = JSON.parse(readFileSync(path.join(dir, 'composer.lock'), 'utf8'));
  const writtenManifest = JSON.parse(readFileSync(path.join(dir, 'composer.json'), 'utf8'));
  assert.equal(writtenLock['content-hash'], 'deadbeef');
  assert.deepEqual(writtenLock['packages-dev'].map((p) => p.name), ['phpunit/phpunit']);
  assert.deepEqual(Object.keys(writtenManifest['require-dev']), ['phpunit/phpunit']);
});

test('patchProject: a project with nothing to omit is left alone', () => {
  const dir = project({
    manifest: { require: {}, 'require-dev': { 'phpunit/phpunit': '^12' } },
    lock: { packages: [], 'packages-dev': [{ name: 'phpunit/phpunit' }] },
  });
  const before = readFileSync(path.join(dir, 'composer.lock'), 'utf8');

  assert.deepEqual(patchProject(dir), { unrequired: [], removed: [] });
  assert.equal(readFileSync(path.join(dir, 'composer.lock'), 'utf8'), before);
});

/**
 * The COMMITTED copy, never the working tree.
 *
 * ensure-dev-stack.sh patches both files in place while it installs and
 * restores them at the end, so a working-tree read fails for the length of a
 * provisioning run — which is exactly when somebody is most likely to run the
 * suite. The committed tree is what CI checks out and what every other machine
 * installs from, so it is also the right thing to assert about.
 */
function committed(path) {
  return JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }));
}

// Checked against the REAL project, because both invariants are properties of
// this repo's dependency graph rather than of the code: composer install
// validates require-dev against the lock, and refuses a lock carrying a hard
// require of a package that is not in it. A future dev tool that requires
// either name breaks provisioning in a web session and nowhere else, so it
// fails here first.
test('the real project stays installable once the pair is omitted', () => {
  const manifestNow = committed('api/composer.json');
  const lockNow = committed('api/composer.lock');

  removeDevRequires(manifestNow);
  const removed = removePackages(lockNow);
  assert.deepEqual(removed, ['larastan/larastan', 'phpstan/phpstan']);

  const present = new Set([...lockNow.packages, ...lockNow['packages-dev']].map((p) => p.name));

  const missing = Object.keys(manifestNow['require-dev'] ?? {}).filter((name) => !present.has(name));
  assert.deepEqual(missing, [], 'every require-dev entry must still be in the lock');

  const dangling = [];
  for (const pkg of [...lockNow.packages, ...lockNow['packages-dev']]) {
    for (const name of Object.keys(pkg.require ?? {})) {
      if (removed.includes(name)) dangling.push(`${pkg.name} requires ${name}`);
    }
  }
  assert.deepEqual(dangling, [], 'nothing left in the lock may require a removed package');
});
