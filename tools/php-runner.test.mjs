// tools/php-runner.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chooseTarget, describeFailure } from './php-runner.mjs';

const nativePresent = () => true;
const nativeAbsent = () => false;

// The point of the long-running service: when it is up, nothing else is used,
// not even a native php that happens to be on PATH.
test('chooseTarget: a healthy php service wins over a native php', () => {
  assert.equal(chooseTarget({ state: 'healthy', native: nativePresent }), 'container');
});

// Web sessions and CI: no stack, a native php.
test('chooseTarget: no service falls back to native php', () => {
  assert.equal(chooseTarget({ state: null, native: nativePresent }), 'native');
});

test('chooseTarget: no service and no native php is reported, not attempted', () => {
  assert.equal(chooseTarget({ state: null, native: nativeAbsent }), null);
});

// A service still installing vendor/ must not be skipped silently for a native
// php: the developer brought the stack up to use it.
test('chooseTarget: a service still starting is reported as starting', () => {
  assert.equal(chooseTarget({ state: 'starting', native: nativePresent }), 'starting');
});

test('chooseTarget: native php is not probed when the service is healthy', () => {
  chooseTarget({
    state: 'healthy',
    native: () => assert.fail('probed native php'),
  });
});

// A red suite is the common case, and it is the one that used to print a Node
// stack trace over the top of the test output you actually came to read.
test('describeFailure: a red suite exits with the suite status and says nothing extra', () => {
  assert.deepEqual(describeFailure({ status: 1 }, 'php'), { status: 1, message: null });
});

// The status the runner chose is handed back as it stands, so a caller that
// branches on it still can.
test('describeFailure: a non-1 status is passed through rather than flattened', () => {
  assert.deepEqual(describeFailure({ status: 2 }, 'php'), { status: 2, message: null });
});

test('describeFailure: a failure carrying no status still exits non-zero', () => {
  assert.deepEqual(describeFailure({}, 'php'), { status: 1, message: null });
  assert.deepEqual(describeFailure(undefined, 'php'), { status: 1, message: null });
});

// THE CASE THIS FILE EXISTS FOR. `php artisan test` with no php on PATH threw
// ENOENT and printed five frames of node:internal, which says nothing about
// what to do. It is reachable for any developer whose stack is down and who has
// no native PHP, which on this project is every Windows developer.
test('describeFailure: a missing binary is named, with the two ways out', () => {
  const { status, message } = describeFailure({ code: 'ENOENT' }, 'php');

  assert.equal(status, 1);
  assert.match(message, /php/);
  assert.match(message, /npm run dev/);
  assert.match(message, /npm run websession:init/);
});

test('describeFailure: the missing binary it names is the one that was missing', () => {
  assert.match(describeFailure({ code: 'ENOENT' }, 'docker').message, /docker/);
});

// An ENOENT carries no useful status, so the diagnosis must not be thrown away
// in favour of one.
test('describeFailure: a missing binary is diagnosed even when a status came with it', () => {
  assert.match(describeFailure({ code: 'ENOENT', status: 7 }, 'php').message, /php/);
});
