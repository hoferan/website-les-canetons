// tools/api-vendor.test.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ensureApiVendor } from './api-vendor.mjs';

// A scratch lock + marker per test, so nothing here touches the real api/vendor.
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'api-vendor-'));
  return {
    dir,
    marker: join(dir, 'vendor', 'bin', 'pint'),
    lockDir: join(dir, 'install.lock'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function holdLock(lockDir, pid) {
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, 'pid'), String(pid));
}

function createMarker(marker) {
  mkdirSync(join(marker, '..'), { recursive: true });
  writeFileSync(marker, '');
}

const quiet = () => {};

test('a satisfied marker installs nothing and takes no lock', () => {
  const s = scratch();
  try {
    createMarker(s.marker);
    let calls = 0;

    const result = ensureApiVendor({
      marker: s.marker,
      lockDir: s.lockDir,
      args: ['install'],
      label: 'pint',
      install: () => { calls += 1; },
      log: quiet,
    });

    assert.equal(result, 'present');
    assert.equal(calls, 0);
    assert.equal(existsSync(s.lockDir), false);
  } finally {
    s.cleanup();
  }
});

test('an uncontended install runs once and leaves no lock behind', () => {
  const s = scratch();
  try {
    let calls = 0;

    const result = ensureApiVendor({
      marker: s.marker,
      lockDir: s.lockDir,
      args: ['install'],
      label: 'pint',
      install: () => { calls += 1; createMarker(s.marker); },
      log: quiet,
    });

    assert.equal(result, 'installed');
    assert.equal(calls, 1);
    assert.equal(existsSync(s.lockDir), false);
  } finally {
    s.cleanup();
  }
});

// THE CASE THIS FILE EXISTS FOR. Four entry points can each start an install
// of api/vendor — provisioning, pint (via the pre-commit hook), phpstan and
// openapi — and on a web session each takes minutes, so two of them overlapping
// is ordinary rather than unlucky. Two concurrent installs write the same
// vendor tree and the same Composer VCS mirror; that is what left this session
// with a 15 GB cache and no autoload.php.
test('a waiter whose install is finished by the lock holder does not install again', () => {
  const s = scratch();
  try {
    let calls = 0;
    let waits = 0;
    holdLock(s.lockDir, process.pid); // a live holder: this very process

    const result = ensureApiVendor({
      marker: s.marker,
      lockDir: s.lockDir,
      args: ['install'],
      label: 'pint',
      install: () => { calls += 1; },
      log: quiet,
      isAlive: () => true,
      // The holder finishes while we are waiting.
      wait: () => {
        waits += 1;
        createMarker(s.marker);
        rmSync(s.lockDir, { recursive: true, force: true });
      },
    });

    assert.equal(result, 'installed-elsewhere');
    assert.equal(calls, 0, 'the waiter must not run a second install');
    assert.equal(waits, 1);
  } finally {
    s.cleanup();
  }
});

// A lock whose holder was killed must not wedge every later run. This session
// killed a Composer mid-clone; without takeover the next install waits for a
// process that will never finish.
test('a lock held by a dead process is taken over', () => {
  const s = scratch();
  try {
    let calls = 0;
    holdLock(s.lockDir, 999_999);

    const result = ensureApiVendor({
      marker: s.marker,
      lockDir: s.lockDir,
      args: ['install'],
      label: 'pint',
      install: () => { calls += 1; createMarker(s.marker); },
      log: quiet,
      isAlive: () => false,
      wait: () => assert.fail('a stale lock must be taken over, not waited on'),
    });

    assert.equal(result, 'installed');
    assert.equal(calls, 1);
    assert.equal(existsSync(s.lockDir), false);
  } finally {
    s.cleanup();
  }
});

test('a failed install releases the lock', () => {
  const s = scratch();
  try {
    assert.throws(
      () => ensureApiVendor({
        marker: s.marker,
        lockDir: s.lockDir,
        args: ['install'],
        label: 'pint',
        install: () => { throw new Error('composer exploded'); },
        log: quiet,
      }),
      /composer exploded/
    );

    assert.equal(existsSync(s.lockDir), false, 'a throw must not leave the lock held');
  } finally {
    s.cleanup();
  }
});

test('waiting past the timeout fails with a message naming the lock', () => {
  const s = scratch();
  try {
    holdLock(s.lockDir, process.pid);
    let clock = 0;

    assert.throws(
      () => ensureApiVendor({
        marker: s.marker,
        lockDir: s.lockDir,
        args: ['install'],
        label: 'pint',
        install: () => assert.fail('must not install while another holder is live'),
        log: quiet,
        isAlive: () => true,
        wait: () => { clock += 60_000; },
        now: () => clock,
        timeoutMs: 120_000,
      }),
      (error) => error.message.includes(s.lockDir)
    );
  } finally {
    s.cleanup();
  }
});
