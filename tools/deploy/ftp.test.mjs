// tools/deploy/ftp.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withRetry, runPool, traverseDirs } from './ftp.mjs';

// A deterministic opts bundle for withRetry: no real waiting, no random jitter,
// so tests assert exact attempt/backoff behavior.
const nowait = (extra = {}) => ({ sleep: async () => {}, jitter: () => 0, ...extra });

// A fake FTP tree keyed by relative dir path ('' = root). Each value is the
// list() result for that dir. Returns a listDir(rel) suitable for traverseDirs.
function fakeTree(tree) {
  return async (rel) => {
    if (!(rel in tree)) {
      throw new Error(`unexpected list of "${rel}"`);
    }
    return tree[rel];
  };
}

const F = (name, size) => ({ name, isDirectory: false, isFile: true, size });
const D = (name) => ({ name, isDirectory: true, isFile: false });

test('withRetry: returns first-attempt result without retrying or sleeping', async () => {
  let ops = 0;
  let reconnects = 0;
  let sleeps = 0;
  const result = await withRetry(
    async () => {
      ops++;
      return 'ok';
    },
    async () => {
      reconnects++;
    },
    nowait({
      sleep: async () => {
        sleeps++;
      },
    })
  );
  assert.equal(result, 'ok');
  assert.equal(ops, 1);
  assert.equal(reconnects, 0);
  assert.equal(sleeps, 0);
});

test('withRetry: reconnects then retries after a failure, then succeeds', async () => {
  let ops = 0;
  let reconnects = 0;
  const delays = [];
  const result = await withRetry(
    async () => {
      ops++;
      if (ops === 1) {
        throw new Error('550 Data connection failed');
      }
      return 'recovered';
    },
    async () => {
      reconnects++;
    },
    nowait({
      baseDelayMs: 300,
      sleep: async (ms) => {
        delays.push(ms);
      },
    })
  );
  assert.equal(result, 'recovered');
  assert.equal(ops, 2);
  assert.equal(reconnects, 1);
  assert.deepEqual(delays, [300]);
});

test('withRetry: throws the last error after exhausting retries', async () => {
  let ops = 0;
  let reconnects = 0;
  await assert.rejects(
    withRetry(
      async () => {
        ops++;
        throw new Error(`fail ${ops}`);
      },
      async () => {
        reconnects++;
      },
      nowait({ retries: 2 })
    ),
    /fail 3/
  );
  assert.equal(ops, 3); // attempts 0, 1, 2
  assert.equal(reconnects, 2); // reconnect before attempts 1 and 2, not after the last
});

test('withRetry: uses exponential backoff between attempts', async () => {
  const delays = [];
  await assert.rejects(
    withRetry(async () => {
      throw new Error('down');
    }, async () => {}, nowait({
      retries: 3,
      baseDelayMs: 300,
      sleep: async (ms) => {
        delays.push(ms);
      },
    })),
    /down/
  );
  assert.deepEqual(delays, [300, 600, 1200]);
});

test('withRetry: caps backoff at maxDelayMs', async () => {
  const delays = [];
  await assert.rejects(
    withRetry(async () => {
      throw new Error('x');
    }, async () => {}, nowait({
      retries: 4,
      baseDelayMs: 1000,
      maxDelayMs: 2500,
      sleep: async (ms) => {
        delays.push(ms);
      },
    })),
    /x/
  );
  assert.deepEqual(delays, [1000, 2000, 2500, 2500]);
});

test('withRetry: retries even when the reconnect step itself fails', async () => {
  let ops = 0;
  let reconnects = 0;
  const result = await withRetry(
    async () => {
      ops++;
      if (ops === 1) {
        throw new Error('op down');
      }
      return 'ok';
    },
    async () => {
      reconnects++;
      if (reconnects === 1) {
        throw new Error('reconnect down');
      }
    },
    nowait({ retries: 3 })
  );
  // attempt 0: op throws -> attempt 1: reconnect throws (caught) -> attempt 2: reconnect ok, op ok
  assert.equal(result, 'ok');
  assert.equal(ops, 2);
  assert.equal(reconnects, 2);
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

test('traverseDirs: collects every file with its size across nested dirs', async () => {
  const tree = {
    '': [F('a.txt', 10), D('sub')],
    sub: [F('b.txt', 20), D('deep')],
    'sub/deep': [F('c.txt', 30)],
  };
  const { files, dirs } = await traverseDirs(4, fakeTree(tree));
  assert.deepEqual(Object.fromEntries([...files].sort()), { 'a.txt': 10, 'sub/b.txt': 20, 'sub/deep/c.txt': 30 });
  assert.deepEqual(dirs.sort(), ['sub', 'sub/deep']);
});

test('traverseDirs: records EMPTY directories too', async () => {
  const tree = {
    '': [D('empty'), D('holds')],
    empty: [], // no files, no subdirs — still must be reported
    holds: [F('f.txt', 1)],
  };
  const { files, dirs } = await traverseDirs(4, fakeTree(tree));
  assert.deepEqual([...files], [['holds/f.txt', 1]]);
  assert.deepEqual(dirs.sort(), ['empty', 'holds']);
});

test('traverseDirs: skips "." and ".." entries', async () => {
  const tree = {
    '': [{ name: '.', isDirectory: true, isFile: false }, { name: '..', isDirectory: true, isFile: false }, F('x', 1)],
  };
  const { files, dirs } = await traverseDirs(2, fakeTree(tree));
  assert.deepEqual([...files], [['x', 1]]);
  assert.deepEqual(dirs, []);
});

test('traverseDirs: ignores symlink/special entries (neither file nor dir)', async () => {
  const tree = {
    '': [F('real', 5), { name: 'cgi-bin', isDirectory: false, isFile: false }],
  };
  const { files, dirs } = await traverseDirs(2, fakeTree(tree));
  assert.deepEqual([...files], [['real', 5]]);
  assert.deepEqual(dirs, []);
});

test('traverseDirs: same result at concurrency 1 and 8', async () => {
  const tree = {
    '': [D('a'), D('b'), F('root.txt', 1)],
    a: [F('a1', 11), F('a2', 12), D('a3')],
    'a/a3': [F('deep', 99)],
    b: [F('b1', 21)],
  };
  const one = await traverseDirs(1, fakeTree(tree));
  const eight = await traverseDirs(8, fakeTree(tree));
  assert.deepEqual(Object.fromEntries([...one.files].sort()), Object.fromEntries([...eight.files].sort()));
  assert.deepEqual(one.dirs.sort(), eight.dirs.sort());
  assert.equal(one.files.size, 5);
});

test('traverseDirs: calls onDir once per directory listed', async () => {
  const tree = { '': [D('sub')], sub: [F('x', 1)] };
  let calls = 0;
  await traverseDirs(4, fakeTree(tree), () => {
    calls++;
  });
  assert.equal(calls, 2); // root + sub
});

test('traverseDirs: rejects when listDir throws', async () => {
  const listDir = async (rel) => {
    if (rel === '') return [D('boom')];
    throw new Error('list failed');
  };
  await assert.rejects(traverseDirs(4, listDir), /list failed/);
});

test('traverseDirs: empty root yields empty file map and no dirs', async () => {
  const { files, dirs } = await traverseDirs(4, fakeTree({ '': [] }));
  assert.equal(files.size, 0);
  assert.deepEqual(dirs, []);
});
