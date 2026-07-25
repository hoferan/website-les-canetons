// tools/deploy/cli.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs } from './cli.mjs';

test('parseArgs: requires a valid target', () => {
  assert.match(parseArgs([]).error, /Usage:/);
  assert.match(parseArgs(['staging']).error, /Usage:/);
});

test('parseArgs: bare target yields all flags off', () => {
  const r = parseArgs(['test']);
  assert.equal(r.error, undefined);
  assert.equal(r.target, 'test');
  assert.deepEqual(
    [r.dryRun, r.force, r.forceDelete, r.relist, r.noDelete, r.verbose, r.status],
    [false, false, false, false, false, false, false]
  );
});

test('parseArgs: maps every known flag', () => {
  const r = parseArgs(['qa', '--dry-run', '--force', '--force-delete', '--relist', '--no-delete', '--verbose', '--status']);
  assert.equal(r.target, 'qa');
  assert.deepEqual(
    [r.dryRun, r.force, r.forceDelete, r.relist, r.noDelete, r.verbose, r.status],
    [true, true, true, true, true, true, true]
  );
});

test('parseArgs: rejects unknown flags and extra positionals', () => {
  assert.match(parseArgs(['test', '--prune']).error, /Unknown flag: --prune/);
  assert.match(parseArgs(['test', 'qa']).error, /Unexpected argument: qa/);
});
