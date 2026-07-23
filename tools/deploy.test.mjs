import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConcurrency, runPool } from './deploy.mjs';

test('parseConcurrency: default 4 when absent/invalid', () => {
  assert.equal(parseConcurrency(undefined), 4);
  assert.equal(parseConcurrency('abc'), 4);
  assert.equal(parseConcurrency(''), 4);
});

test('parseConcurrency: clamps to 1..8', () => {
  assert.equal(parseConcurrency('0'), 1);
  assert.equal(parseConcurrency('-5'), 1);
  assert.equal(parseConcurrency('3'), 3);
  assert.equal(parseConcurrency('99'), 8);
});

test('runPool: processes every item exactly once', async () => {
  const seen = [];
  await runPool([10, 20, 30, 40, 50], 2, async (n) => {
    seen.push(n);
  });
  assert.deepEqual(seen.sort((a, b) => a - b), [10, 20, 30, 40, 50]);
});

test('runPool: never exceeds the concurrency cap', async () => {
  let active = 0;
  let maxActive = 0;
  await runPool([...Array(20).keys()], 3, async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setImmediate(r));
    active--;
  });
  assert.ok(maxActive <= 3, `maxActive=${maxActive}`);
});

test('runPool: rejects on worker error and stops starting new items', async () => {
  let started = 0;
  await assert.rejects(
    runPool([...Array(20).keys()], 2, async (i) => {
      started++;
      if (i === 0) throw new Error('boom');
      await new Promise((r) => setImmediate(r));
    }),
    /boom/
  );
  assert.ok(started < 20, `started=${started} should be < 20 (stopped early)`);
});

test('runPool: empty items resolves without calling worker', async () => {
  let called = false;
  await runPool([], 4, async () => {
    called = true;
  });
  assert.equal(called, false);
});
