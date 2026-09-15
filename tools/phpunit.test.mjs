// tools/phpunit.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeFailure } from './phpunit.mjs';

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
