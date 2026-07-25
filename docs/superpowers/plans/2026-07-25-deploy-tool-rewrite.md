# Deploy Tool Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tools/deploy.mjs` with a fresh modular `tools/deploy/` package: mirror-by-default FTP sync (upload + delete stale, behind a mass-delete brake) with a step-list/progress-bar UI on a TTY and plain logs in CI.

**Architecture:** Six small modules with hard boundaries — `sync.mjs` (pure diff/brake logic), `ftp.mjs` (only module doing FTP I/O), `state.mjs` (`.sync-state.json`), `local.mjs` (build scan/hash/marker), `preflight.mjs` (guards + config-shape check), `ui.mjs` (only module that prints) — wired together solely by `cli.mjs`. Spec: `docs/superpowers/specs/2026-07-25-deploy-tool-rewrite-design.md`.

**Tech Stack:** Node ≥20 ES modules, `basic-ftp`, `php-parser`, `node:test` (all already devDependencies — no new deps).

---

## Context for the implementer (read first)

- **Working tree state:** `tools/deploy.mjs`, `tools/deploy.test.mjs`, `CLAUDE.md`, and `package.json` carry **uncommitted** modifications from an abandoned overhaul. This plan copies ("harvests") proven code out of that uncommitted `tools/deploy.mjs` — all harvested code is **inlined in this plan**, so you never need the old file. Do NOT revert or commit those files except where a task says so.
- **Commit hygiene:** always `git add` the exact paths named in the task — never `git add -A`/`git add .` (it would sweep the unrelated uncommitted files in).
- Run all commands from the repo root. `npm run test:js` still points at the old test file until Task 8 — until then run the new tests with `node --test tools/deploy/`.
- Every FTP-facing behavior (retry, pooling, protected files) is tuned to a flaky shared host (`easy-hebergement.net`): idle control sockets get dropped, passive data channels fail under concurrency. Do not "simplify away" retries or the reconnect steps.
- The remote state file format (`files: {rel → {size, hash}}`) is **deliberately identical** to the one the old tool wrote, so an existing `.sync-state.json` on TEST keeps working.

## File structure

| File | Responsibility |
|---|---|
| `tools/deploy/sync.mjs` | Pure functions: classify local vs remote, safety brake, dir ordering, verify diff. No I/O, no printing. |
| `tools/deploy/ftp.mjs` | Pool, `withRetry`, tree walk, bulk phases (list/upload/delete/sweep/verify). Only FTP I/O. |
| `tools/deploy/state.mjs` | `.sync-state.json` schema, build/parse/download/upload. |
| `tools/deploy/local.mjs` | Local build walk, sha256 fingerprint, `deployment.json` marker. |
| `tools/deploy/preflight.mjs` | `PROTECTED` set, env path guard, config.php shape check (php-parser, never evaluated). |
| `tools/deploy/ui.mjs` | Step engine: TTY renderer / plain CI logger. Only module that prints. |
| `tools/deploy/cli.mjs` | Entry point: arg parsing, .env loading, pipeline orchestration. |
| `tools/deploy/*.test.mjs` | One test file per module, `node:test`. |

Deleted at the end: `tools/deploy.mjs`, `tools/deploy.test.mjs`. Modified: `package.json`, `.github/workflows/{_deploy,deploy-test,deploy-qa,deploy-prod,ci}.yml`, `CLAUDE.md`, `staging/README.md`, `.env.example`.

---

### Task 1: `sync.mjs` — pure diff/brake/order logic

**Files:**
- Create: `tools/deploy/sync.mjs`
- Test: `tools/deploy/sync.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tools/deploy/sync.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseConcurrency,
  groupByDir,
  classify,
  classifyWithList,
  brakeTrips,
  diffSizes,
  emptyDirsAfterDelete,
  deepestFirst,
} from './sync.mjs';

// Build a local-entries Map<rel,{size,hash}> from a compact {rel: [size, hash]} spec.
const entries = (spec) => new Map(Object.entries(spec).map(([rel, [size, hash]]) => [rel, { size, hash }]));
const PROT = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd', '.sync-state.json']);

test('parseConcurrency: default 6 when absent/invalid', () => {
  assert.equal(parseConcurrency(undefined), 6);
  assert.equal(parseConcurrency('abc'), 6);
  assert.equal(parseConcurrency(''), 6);
});

test('parseConcurrency: clamps to 1..8', () => {
  assert.equal(parseConcurrency('0'), 1);
  assert.equal(parseConcurrency('-5'), 1);
  assert.equal(parseConcurrency('3'), 3);
  assert.equal(parseConcurrency('99'), 8);
});

test('groupByDir: groups by posix parent, "." for root-level files', () => {
  const g = groupByDir([{ rel: 'a.txt' }, { rel: 'sub/b.txt' }, { rel: 'sub/c.txt' }, { rel: 'x/y/d.txt' }]);
  assert.deepEqual([...g.keys()].sort(), ['.', 'sub', 'x/y']);
  assert.equal(g.get('sub').length, 2);
});

test('classify: new / changed / unchanged / stale by hash', () => {
  const local = entries({
    'keep.js': [10, 'h-keep'], // same hash -> unchanged
    'edit.js': [20, 'h-new'], // hash differs -> changed
    'brand-new.js': [30, 'h-bn'], // absent from state -> new
  });
  const remoteFiles = {
    'keep.js': { size: 10, hash: 'h-keep' },
    'edit.js': { size: 20, hash: 'h-old' },
    'gone.js': { size: 40, hash: 'h-gone' }, // absent from local -> stale
  };
  const r = classify(local, remoteFiles, PROT);
  assert.deepEqual(r.newFiles.map((f) => f.rel), ['brand-new.js']);
  assert.deepEqual(r.changed.map((f) => f.rel), ['edit.js']);
  assert.equal(r.unchanged, 1);
  assert.deepEqual(r.stale, ['gone.js']);
});

test('classify: null state treats everything as new, nothing stale', () => {
  const r = classify(entries({ 'a.js': [1, 'h'] }), null, PROT);
  assert.deepEqual(r.newFiles.map((f) => f.rel), ['a.js']);
  assert.equal(r.unchanged, 0);
  assert.deepEqual(r.stale, []);
});

test('classify: never marks a protected file stale', () => {
  const remoteFiles = { '.htaccess': { size: 1, hash: 'h' }, 'config.php': { size: 2, hash: 'h' } };
  const r = classify(entries({}), remoteFiles, PROT);
  assert.deepEqual(r.stale, []);
});

test('classifyWithList: bootstrap (no state) re-uploads every present file', () => {
  const local = entries({ 'a.js': [1, 'ha'], 'b.js': [2, 'hb'] });
  const remoteSizes = new Map([
    ['a.js', 1],
    ['old.js', 9],
  ]);
  const r = classifyWithList(local, remoteSizes, null, PROT);
  // a.js exists on server but no hash record -> changed; b.js not on server -> new
  assert.deepEqual(r.newFiles.map((f) => f.rel), ['b.js']);
  assert.deepEqual(r.changed.map((f) => f.rel), ['a.js']);
  assert.equal(r.unchanged, 0);
  assert.deepEqual(r.stale, ['old.js']);
});

test('classifyWithList: unchanged needs matching hash AND matching server size (drift)', () => {
  const local = entries({ 'clean.js': [10, 'h1'], 'drift.js': [20, 'h2'] });
  const remoteSizes = new Map([
    ['clean.js', 10], // size matches
    ['drift.js', 999], // size differs from local 20 -> drift -> changed
  ]);
  const remoteFiles = {
    'clean.js': { size: 10, hash: 'h1' },
    'drift.js': { size: 20, hash: 'h2' }, // state hash matches, but server size drifted
  };
  const r = classifyWithList(local, remoteSizes, remoteFiles, PROT);
  assert.equal(r.unchanged, 1); // clean.js
  assert.deepEqual(r.changed.map((f) => f.rel), ['drift.js']);
  assert.deepEqual(r.newFiles, []);
});

test('classifyWithList: never marks a protected file stale', () => {
  const remoteSizes = new Map([
    ['.htaccess', 1],
    ['sub/config.php', 2],
    ['junk.js', 3],
  ]);
  const r = classifyWithList(entries({}), remoteSizes, null, PROT);
  assert.deepEqual(r.stale, ['junk.js']);
});

test('brakeTrips: needs BOTH >50 files AND >20% of remote', () => {
  assert.equal(brakeTrips(50, 100), false); // not >50
  assert.equal(brakeTrips(51, 100), true); // 51 > 50 and 51 > 20
  assert.equal(brakeTrips(51, 1000), false); // 51 <= 200 (20%)
  assert.equal(brakeTrips(300, 1000), true);
  assert.equal(brakeTrips(0, 0), false);
  assert.equal(brakeTrips(201, 1000), true); // 201 > 200
  assert.equal(brakeTrips(200, 1000), false); // exactly 20% does not trip
});

test('diffSizes: ok when every uploaded file matches the remote size', () => {
  const r = diffSizes(
    [{ rel: 'a', size: 1 }, { rel: 'b', size: 2 }],
    new Map([
      ['a', 1],
      ['b', 2],
    ])
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.mismatched, []);
});

test('diffSizes: reports missing and mismatched uploads, ignores unrelated remote files', () => {
  const r = diffSizes(
    [{ rel: 'gone', size: 5 }, { rel: 'short', size: 100 }],
    new Map([
      ['short', 42],
      ['unrelated', 7],
    ])
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['gone']);
  assert.deepEqual(r.mismatched, [{ rel: 'short', local: 100, remote: 42 }]);
});

test('emptyDirsAfterDelete: dir with only deleted files is listed', () => {
  assert.deepEqual(emptyDirsAfterDelete(['old/a.js', 'old/b.js'], ['old/a.js', 'old/b.js', 'keep/c.js']), ['old']);
});

test('emptyDirsAfterDelete: dir with a surviving file is NOT listed', () => {
  assert.deepEqual(emptyDirsAfterDelete(['mix/old.js'], ['mix/old.js', 'mix/keep.js']), []);
});

test('emptyDirsAfterDelete: nested empties come deepest-first', () => {
  assert.deepEqual(emptyDirsAfterDelete(['a/b/c/x.js', 'a/b/c/y.js'], ['a/b/c/x.js', 'a/b/c/y.js']), ['a/b/c', 'a/b', 'a']);
});

test('emptyDirsAfterDelete: partial nesting keeps the surviving ancestor', () => {
  // a/b/c and a/b become empty; a survives (has keep.js)
  assert.deepEqual(emptyDirsAfterDelete(['a/b/c/x.js'], ['a/b/c/x.js', 'a/keep.js']), ['a/b/c', 'a/b']);
});

test('emptyDirsAfterDelete: root-level deletions yield no dirs', () => {
  assert.deepEqual(emptyDirsAfterDelete(['x.js'], ['x.js', 'y.js']), []);
});

test('deepestFirst: children precede parents; same depth by name; dedupes', () => {
  assert.deepEqual(deepestFirst(['a', 'a/b/c', 'a/b', 'x/y']), ['a/b/c', 'a/b', 'x/y', 'a']);
  assert.deepEqual(deepestFirst(['z/a', 'm/b', 'q/c', 'm/b']), ['m/b', 'q/c', 'z/a']);
  assert.deepEqual(deepestFirst([]), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/deploy/`
Expected: FAIL — `Cannot find module ... sync.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/deploy/sync.mjs
// Pure sync/diff logic for the FTP deploy tool: local-vs-remote classification,
// the mass-delete safety brake, directory ordering, and the post-upload verify
// diff. No I/O and no printing — every function here is unit-testable alone.
import path from 'node:path';

// Parse FTP_CONCURRENCY: default 6, clamped 1..8 (stays under this host's ~10
// concurrent-connection budget; 1 = serial).
export function parseConcurrency(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 6;
  }
  return Math.min(8, Math.max(1, n));
}

// Group [{rel, ...}] by posix parent directory ('.' for root-level files).
export function groupByDir(files) {
  const byDir = new Map();
  for (const f of files) {
    const d = path.posix.dirname(f.rel);
    if (!byDir.has(d)) {
      byDir.set(d, []);
    }
    byDir.get(d).push(f);
  }
  return byDir;
}

// FAST-PATH diff (no remote LIST): classify local files against the remote
// state file alone. `localEntries` is Map<rel, {size, hash}>; `remoteFiles` is
// the state file's `files` object (or null on bootstrap); `protectedSet` holds
// basenames that are never uploaded or deleted.
export function classify(localEntries, remoteFiles, protectedSet) {
  const remote = remoteFiles || {};
  const newFiles = [];
  const changed = [];
  let unchanged = 0;
  for (const [rel, loc] of localEntries) {
    const r = remote[rel];
    if (!r) {
      newFiles.push({ rel, size: loc.size });
    } else if (r.hash !== loc.hash) {
      changed.push({ rel, size: loc.size, remoteSize: r.size });
    } else {
      unchanged++;
    }
  }
  const localSet = new Set(localEntries.keys());
  const stale = Object.keys(remote)
    .filter((rel) => !localSet.has(rel) && !protectedSet.has(path.posix.basename(rel)))
    .sort();
  return { newFiles, changed, unchanged, stale };
}

// AUTHORITATIVE diff (--relist / bootstrap): the remote LIST is the source of
// truth for what EXISTS (so deletion is grounded in the server's real tree)
// and for byte sizes (drift check); the state file supplies content hashes.
export function classifyWithList(localEntries, remoteSizes, remoteFiles, protectedSet) {
  const remote = remoteFiles || {};
  const newFiles = [];
  const changed = [];
  let unchanged = 0;
  for (const [rel, loc] of localEntries) {
    if (!remoteSizes.has(rel)) {
      newFiles.push({ rel, size: loc.size });
      continue;
    }
    const serverSize = remoteSizes.get(rel);
    const m = remote[rel];
    if (!m || m.hash !== loc.hash || serverSize !== loc.size) {
      changed.push({ rel, size: loc.size, remoteSize: serverSize });
    } else {
      unchanged++;
    }
  }
  const localSet = new Set(localEntries.keys());
  const stale = [...remoteSizes.keys()]
    .filter((rel) => !localSet.has(rel) && !protectedSet.has(path.posix.basename(rel)))
    .sort();
  return { newFiles, changed, unchanged, stale };
}

// Mass-delete safety brake: a mirror deploy must not wipe the server because a
// broken/empty build made everything look stale. Trips only when BOTH more
// than 50 files AND more than 20% of the remote file count would be deleted.
export function brakeTrips(deleteCount, remoteFileCount) {
  return deleteCount > 50 && deleteCount > remoteFileCount * 0.2;
}

// Compare the files uploaded this run against fresh remote sizes. `uploaded`
// is [{rel, size}]; `remoteSizes` is Map<rel, size>. Reports files that did
// not land (missing) or landed at the wrong byte count (mismatched =
// truncated/partial). Remote files not in `uploaded` are ignored.
export function diffSizes(uploaded, remoteSizes) {
  const missing = [];
  const mismatched = [];
  for (const f of uploaded) {
    const remote = remoteSizes.get(f.rel);
    if (remote === undefined) {
      missing.push(f.rel);
    } else if (remote !== f.size) {
      mismatched.push({ rel: f.rel, local: f.size, remote });
    }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

// Directories that hold no surviving file once `deletedPaths` are removed,
// given the full pre-delete remote file list `remoteFiles` (both posix
// rel-paths). Returned deepest-first so a parent is only removed after its
// children. Used by the fast path to pick empty-dir sweep candidates.
export function emptyDirsAfterDelete(deletedPaths, remoteFiles) {
  const deletedSet = new Set(deletedPaths);
  const survivors = remoteFiles.filter((f) => !deletedSet.has(f));
  const candidates = new Set();
  for (const rel of deletedPaths) {
    let dir = path.posix.dirname(rel);
    while (dir && dir !== '.') {
      candidates.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  return deepestFirst([...candidates].filter((dir) => !survivors.some((s) => s.startsWith(`${dir}/`))));
}

// Order directories DEEPEST-FIRST (then by name), so an RMD sweep removes a
// child before its parent — the parent only becomes empty once its subdirs are
// gone. Pure. Deduplicates.
export function deepestFirst(dirs) {
  return [...new Set(dirs)].sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/deploy/`
Expected: PASS (all sync tests)

- [ ] **Step 5: Commit**

```bash
git add tools/deploy/sync.mjs tools/deploy/sync.test.mjs
git commit -m "feat(deploy): add pure sync/diff module for the deploy rewrite"
```

---

### Task 2: `ftp.mjs` — resilient FTP layer

**Files:**
- Create: `tools/deploy/ftp.mjs`
- Test: `tools/deploy/ftp.test.mjs`

The pure/injectable parts (`withRetry`, `runPool`, `traverseDirs`) are unit-tested; the thin `basic-ftp` wrappers (`openPool`, `uploadFiles`, …) are exercised by the manual integration pass in Task 11.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/deploy/`
Expected: FAIL — `Cannot find module ... ftp.mjs` (sync tests still pass)

- [ ] **Step 3: Write the implementation**

```js
// tools/deploy/ftp.mjs
// FTP I/O layer: connection pool, retry-with-reconnect, parallel tree walk,
// and the bulk phases (list / upload / delete / sweep / verify). This is the
// ONLY module that talks to the FTP server. No printing — progress is reported
// through callbacks so the UI layer stays in charge of output.
import ftp from 'basic-ftp';
import path from 'node:path';
import { groupByDir, diffSizes, deepestFirst } from './sync.mjs';

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
// Up to 50% extra, so parallel connections that fail together don't all retry
// in lockstep and re-collide.
const defaultJitter = (base) => Math.random() * base * 0.5;

// Run `op()`, and on failure back off (exponential + jitter), reconnect, and
// retry — up to `retries` times. This shared host is flaky under concurrency:
// idle pooled control sockets get dropped ("Timeout (control socket)") and
// passive data channels fail mid-transfer ("550 Data connection failed"), and
// without retries either one aborts the whole deploy. `onRetry(attempt)` is the
// reconnect step; it runs INSIDE the retry loop (before re-running `op`), so a
// failed reconnect is itself retried. `sleep`/`jitter` are injected so backoff
// is unit-testable without real waiting. Throws the last error once exhausted.
export async function withRetry(op, onRetry, opts = {}) {
  const { retries = 3, baseDelayMs = 300, maxDelayMs = 5000, sleep = sleepMs, jitter = defaultJitter } = opts;
  let lastErr;
  for (let attempt = 0; ; attempt++) {
    try {
      if (attempt > 0 && onRetry) {
        await onRetry(attempt);
      }
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) {
        break;
      }
      const base = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(base + jitter(base));
    }
  }
  throw lastErr;
}

// Run `worker(item, index)` across up to `concurrency` cooperating workers
// pulling from a shared cursor. Pure w.r.t. I/O (worker is injected).
// Fail-fast: the first worker rejection stops new items from starting.
export async function runPool(items, concurrency, worker) {
  let next = 0;
  let failed = false;
  const runWorker = async () => {
    while (!failed) {
      const i = next++;
      if (i >= items.length) {
        return;
      }
      try {
        await worker(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const workers = Math.max(0, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
}

// Work-stealing recursive directory walk. `listDir(rel, workerIndex)` returns
// the FTP list() result for the (posix, base-relative) dir `rel` ('' = base);
// the walk fans out across `concurrency` cooperating workers, each pinned to
// its own `workerIndex` (so the caller can hand each worker a dedicated FTP
// connection). Returns `{ files: Map<rel,size>, dirs: string[] }` — plain
// files, and EVERY directory discovered (including empty ones). '.'/'..' and
// non-file/non-dir entries (symlinks like cgi-bin) are skipped so deletion can
// never touch server infra. `onDir(count)` fires once per directory listed.
// Fail-fast: the first listDir rejection aborts the walk and rejects.
export async function traverseDirs(concurrency, listDir, onDir) {
  const files = new Map();
  const dirs = [];
  const queue = ['']; // base-relative dirs still to list
  let pending = 0; // dirs claimed by a worker but not yet finished
  let listed = 0;
  let failed = null;

  const worker = async (workerIndex) => {
    while (!failed) {
      if (queue.length === 0) {
        if (pending === 0) {
          return; // nothing queued and nothing in flight -> the walk is done
        }
        await new Promise((r) => setImmediate(r)); // let an in-flight list enqueue more
        continue;
      }
      const rel = queue.shift();
      pending++;
      try {
        for (const item of await listDir(rel, workerIndex)) {
          if (item.name === '.' || item.name === '..') {
            continue;
          }
          const childRel = rel ? `${rel}/${item.name}` : item.name;
          if (item.isDirectory) {
            dirs.push(childRel); // recorded even if it turns out empty
            queue.push(childRel);
          } else if (item.isFile) {
            files.set(childRel, item.size);
          }
        }
        listed++;
        if (onDir) {
          onDir(listed);
        }
      } catch (err) {
        failed = err;
        throw err;
      } finally {
        pending--;
      }
    }
  };

  const n = Math.max(1, concurrency);
  await Promise.all(Array.from({ length: n }, (_, i) => worker(i)));
  if (failed) {
    throw failed;
  }
  return { files, dirs };
}

// Open a pool of `size` freshly-connected FTP clients. If any connection
// fails, closes the ones already opened before rethrowing.
export async function openPool(size, accessOpts) {
  const clients = [];
  try {
    for (let i = 0; i < size; i++) {
      const c = new ftp.Client();
      clients.push(c);
      await c.access(accessOpts);
    }
  } catch (err) {
    clients.forEach((c) => c.close());
    throw err;
  }
  return clients;
}

// Build an `onRetry` for `withRetry` that reconnects one client and, when a
// working directory is given (uploads), restores it via ensureDir before the
// operation is retried. LIST/remove use absolute paths, so they pass no dir.
export function reconnector(client, accessOpts, restoreDir) {
  return async () => {
    client.close();
    await client.access(accessOpts);
    if (restoreDir) {
      await client.ensureDir(restoreDir);
    }
  };
}

// Run `worker(item, client, index)` over `items` across a fresh pool of up to
// `size` FTP connections, each item pinned to one free connection for its
// duration. The single parallel mechanism every bulk phase — upload, verify,
// delete — shares, so they all fan out over the same FTP_CONCURRENCY budget
// with identical connection lifecycle. Closes the pool at the end.
export async function withPool(size, accessOpts, items, worker) {
  const workers = Math.max(1, Math.min(size, items.length || 1));
  const pool = await openPool(workers, accessOpts);
  const free = [...pool];
  try {
    await runPool(items, workers, async (item, index) => {
      const c = free.pop();
      try {
        await worker(item, c, index);
      } finally {
        free.push(c);
      }
    });
  } finally {
    pool.forEach((c) => c.close());
  }
}

// Snapshot the whole remote tree, walking directories in parallel across a
// fresh pool of `concurrency` connections (one LIST round-trip per directory
// is the slowest part of an authoritative deploy on this host). Returns
// { files: Map<rel,size>, dirs: string[] } — every remote file and every
// remote directory (empty ones included).
export async function listRemote(remoteRoot, accessOpts, concurrency, onProgress) {
  const clients = await openPool(concurrency, accessOpts);
  try {
    return await traverseDirs(
      concurrency,
      (rel, i) =>
        withRetry(
          () => clients[i].list(rel ? `${remoteRoot}/${rel}` : remoteRoot),
          reconnector(clients[i], accessOpts)
        ),
      onProgress
    );
  } finally {
    clients.forEach((c) => c.close());
  }
}

// Upload `toUpload` ([{rel, size}]) across up to `workers` resilient
// connections, grouped by directory (one ensureDir per folder). Calls
// `onDone(rel, size)` after each file lands. Throws (after retries) only on a
// hard failure. uploadFrom re-sends the whole file, so a retry just
// overwrites; on reconnect the working directory is restored first.
export async function uploadFiles(toUpload, localRoot, remoteRoot, accessOpts, workers, onDone) {
  const batches = [...groupByDir(toUpload).entries()];
  await withPool(workers, accessOpts, batches, async ([d, files], c) => {
    const remoteDir = d === '.' ? remoteRoot : `${remoteRoot}/${d}`;
    await withRetry(() => c.ensureDir(remoteDir), reconnector(c, accessOpts));
    for (const f of files) {
      await withRetry(
        () => c.uploadFrom(path.join(localRoot, f.rel), path.posix.basename(f.rel)),
        reconnector(c, accessOpts, remoteDir)
      );
      onDone(f.rel, f.size);
    }
  });
}

// Delete stale FILES in parallel (FTP has no recursive delete; per-file DELEs
// are spread across the pool grouped by directory — same fan-out as uploads).
// State-file-based deletion may target a file the server already lost, so a
// terminal 550 ("not found") counts as already gone instead of failing the
// mirror. Calls `onDeleted(count)` as files go. Returns the count deleted.
export async function deleteFiles(stale, remoteRoot, accessOpts, concurrency, onDeleted) {
  const batches = [...groupByDir(stale.map((rel) => ({ rel }))).entries()];
  let deleted = 0;
  await withPool(concurrency, accessOpts, batches, async ([, files], c) => {
    for (const f of files) {
      try {
        await withRetry(() => c.remove(`${remoteRoot}/${f.rel}`), reconnector(c, accessOpts), { retries: 1 });
      } catch (err) {
        if (err?.code === 550) {
          continue; // already gone — the goal state is reached either way
        }
        throw err;
      }
      onDeleted(++deleted);
    }
  });
  return deleted;
}

// Try to RMD every candidate directory DEEPEST-FIRST on one connection: a
// child is always attempted before its parent, so an entire empty subtree
// collapses inside-out in one pass (FTP can only delete EMPTY directories). A
// dir that still holds a surviving/protected file returns 550 and is skipped.
// Serial by design (children-before-parents ordering; cleanup, not the hot
// path). Calls `onSwept(attempted, removed)`. Returns the number removed.
export async function sweepEmptyDirs(dirs, remoteRoot, accessOpts, client, onSwept) {
  const ordered = deepestFirst(dirs);
  let removed = 0;
  let attempted = 0;
  for (const d of ordered) {
    attempted++;
    try {
      await withRetry(() => client.removeEmptyDir(`${remoteRoot}/${d}`), reconnector(client, accessOpts), {
        retries: 1,
      });
      removed++;
    } catch {
      // still non-empty (a surviving or protected file) — leave it.
    }
    if (onSwept) {
      onSwept(attempted, removed);
    }
  }
  return removed;
}

// Verify the files we just uploaded WITHOUT re-walking the whole tree: LIST
// only the distinct directories we uploaded into (bounded by the change set),
// collect their file sizes, and diffSizes against what we sent. Uses the same
// LIST-based sizes the deploy already trusts (no reliance on FTP SIZE).
export async function verifyUploaded(remoteRoot, accessOpts, concurrency, uploaded) {
  const dirs = [...groupByDir(uploaded).keys()];
  const remoteSizes = new Map();
  await withPool(concurrency, accessOpts, dirs, async (d, c) => {
    const dirPath = d === '.' ? remoteRoot : `${remoteRoot}/${d}`;
    const items = await withRetry(() => c.list(dirPath), reconnector(c, accessOpts));
    for (const it of items) {
      if (it.isFile) {
        remoteSizes.set(d === '.' ? it.name : `${d}/${it.name}`, it.size);
      }
    }
  });
  return diffSizes(uploaded, remoteSizes);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/deploy/`
Expected: PASS (sync + ftp tests)

- [ ] **Step 5: Commit**

```bash
git add tools/deploy/ftp.mjs tools/deploy/ftp.test.mjs
git commit -m "feat(deploy): add resilient FTP layer (retry, pool, parallel walk, bulk phases)"
```

---

### Task 3: `state.mjs` — the `.sync-state.json` state file

**Files:**
- Create: `tools/deploy/state.mjs`
- Test: `tools/deploy/state.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tools/deploy/state.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATE_FILE, buildState, parseState } from './state.mjs';

test('STATE_FILE is the dotfile name the server-side manifest uses', () => {
  assert.equal(STATE_FILE, '.sync-state.json');
});

test('buildState: assembles version/env/commit/status and sorts file keys', () => {
  const entries = new Map([
    ['z/last.js', { size: 2, hash: 'hz' }],
    ['a/first.js', { size: 1, hash: 'ha' }],
  ]);
  const s = buildState('test', 'abc1234', entries, 'in-progress');
  assert.equal(s.version, 1);
  assert.equal(s.environment, 'test');
  assert.equal(s.commit, 'abc1234');
  assert.equal(s.status, 'in-progress');
  assert.match(s.updatedAt, /^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  assert.deepEqual(Object.keys(s.files), ['a/first.js', 'z/last.js']);
  assert.deepEqual(s.files['a/first.js'], { size: 1, hash: 'ha' });
});

test('parseState: accepts a valid state object', () => {
  const s = parseState(JSON.stringify({ version: 1, files: { 'a.js': { size: 1, hash: 'h' } } }));
  assert.equal(s.files['a.js'].hash, 'h');
});

test('parseState: rejects malformed JSON and shapes without files', () => {
  assert.equal(parseState('not json at all'), null);
  assert.equal(parseState(JSON.stringify({ version: 1 })), null);
  assert.equal(parseState(JSON.stringify('a string')), null);
  assert.equal(parseState(JSON.stringify(null)), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/deploy/`
Expected: FAIL — `Cannot find module ... state.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/deploy/state.mjs
// The server-side sync-state file: records what this tool has confirmed on the
// server (each deployed path -> {size, sha256 hash}). A routine deploy diffs
// the local build against this one small file instead of walking the whole
// remote tree, and it makes an aborted deploy resumable. A dotfile so the
// front-controller catch-all + .htaccess don't serve it; part of PROTECTED so
// it's never deleted. Format is unchanged from the previous tool, so an
// existing .sync-state.json on a server keeps working.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withRetry, reconnector } from './ftp.mjs';

export const STATE_FILE = '.sync-state.json';

// Assemble the state object written to the server. `entries` is
// Map<rel, {size, hash}>; `status` is 'in-progress' (checkpoint) or 'complete'.
export function buildState(environment, commit, entries, status) {
  const files = {};
  for (const [rel, e] of [...entries.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    files[rel] = e;
  }
  return { version: 1, environment, commit, updatedAt: new Date().toISOString(), status, files };
}

// Parse raw JSON into a state object, or null when it isn't one (malformed,
// or missing the `files` map).
export function parseState(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Download and parse the remote state file, or null if it isn't there / is
// unreadable (a brand-new environment, i.e. bootstrap). Best-effort with a
// light retry so a transient blip doesn't look like "no state" and trigger a
// full re-upload.
export async function downloadState(client, remoteRoot, accessOpts) {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-state-'));
  const tmp = path.join(tmpDir, STATE_FILE);
  try {
    try {
      await withRetry(() => client.downloadTo(tmp, `${remoteRoot}/${STATE_FILE}`), reconnector(client, accessOpts), {
        retries: 2,
      });
    } catch {
      return null;
    }
    return parseState(readFileSync(tmp, 'utf8'));
  } catch {
    return null;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Write the state file to the server root (resilient; restores cwd on
// reconnect via ensureDir).
export async function uploadState(client, remoteRoot, accessOpts, state) {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-state-'));
  const tmp = path.join(tmpDir, STATE_FILE);
  try {
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    await withRetry(
      async () => {
        await client.ensureDir(remoteRoot);
        await client.uploadFrom(tmp, STATE_FILE);
      },
      reconnector(client, accessOpts)
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/deploy/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/deploy/state.mjs tools/deploy/state.test.mjs
git commit -m "feat(deploy): add sync-state file module (schema, download, upload)"
```

---

### Task 4: `local.mjs` — build scan, fingerprint, deployment marker

**Files:**
- Create: `tools/deploy/local.mjs`
- Test: `tools/deploy/local.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/deploy/`
Expected: FAIL — `Cannot find module ... local.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/deploy/local.mjs
// Local-side inputs to a deploy: walk the built artifact, fingerprint every
// file (sha256 content hash — so change detection has no "same size, changed
// content" blind spot), and write the deployment.json marker that records
// which commit is deployed. Filesystem/git only — no FTP, no printing.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// The deployment marker, written into the build root on every deploy and
// web-readable at /deployment.json. Its deployedAt changes every run, so its
// hash always differs and it re-uploads naturally.
export const MARKER = 'deployment.json';

// Walk the build tree: [{rel, size}] with posix rel paths, sorted, excluding
// protected basenames (server-owned files must never even be candidates).
export function walkBuild(root, protectedSet) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!protectedSet.has(entry.name)) {
        out.push({ rel: path.relative(root, full).split(path.sep).join('/'), size: statSync(full).size });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// Fingerprint every file: Map<rel, {size, hash}> (sha256 of the bytes).
// Hashing ~7,000 build files is ~1-2s. `onProgress(done, total)` fires every
// `every` files so the UI can show a bar.
export function fingerprint(root, files, onProgress, every = 500) {
  const entries = new Map();
  let done = 0;
  for (const f of files) {
    const hash = createHash('sha256').update(readFileSync(path.join(root, f.rel))).digest('hex');
    entries.set(f.rel, { size: f.size, hash });
    done++;
    if (onProgress && done % every === 0) {
      onProgress(done, files.length);
    }
  }
  return entries;
}

// Write the deployment marker into the build root so each server records
// exactly which commit is deployed there. Values come from GitHub Actions env
// vars in CI, falling back to local git for hand-runs.
export function writeDeploymentMarker(environment, root) {
  const gitOr = (fallback, ...gitArgs) => {
    try {
      return execFileSync('git', gitArgs, { encoding: 'utf8' }).trim();
    } catch {
      return fallback;
    }
  };
  const commit = process.env.GITHUB_SHA || gitOr('local', 'rev-parse', 'HEAD');
  const shortCommit = process.env.GITHUB_SHA
    ? process.env.GITHUB_SHA.slice(0, 7)
    : gitOr('local', 'rev-parse', '--short', 'HEAD');
  const ref = process.env.GITHUB_REF_NAME || gitOr('', 'rev-parse', '--abbrev-ref', 'HEAD');
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const runUrl =
    GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : null;
  const marker = { environment, commit, shortCommit, ref, deployedAt: new Date().toISOString(), runUrl };
  writeFileSync(path.join(root, MARKER), `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/deploy/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/deploy/local.mjs tools/deploy/local.test.mjs
git commit -m "feat(deploy): add local scan/fingerprint/marker module"
```

---

### Task 5: `preflight.mjs` — guards + config-shape check

**Files:**
- Create: `tools/deploy/preflight.mjs`
- Test: `tools/deploy/preflight.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tools/deploy/preflight.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROTECTED,
  TARGETS,
  checkTargetDir,
  configKeyPathsFromSource,
  compareConfigShape,
} from './preflight.mjs';

test('PROTECTED: server-owned files plus the tool-owned state file', () => {
  for (const name of ['.htaccess', 'robots.txt', 'config.php', '.htpasswd', '.sync-state.json']) {
    assert.ok(PROTECTED.has(name), `${name} must be protected`);
  }
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

test('configKeyPathsFromSource: flattens nested arrays to sorted dotted paths', () => {
  const src = `<?php return ['db' => ['host' => 'x', 'name' => 'y'], 'env' => 'dev', 'list' => [1, 2]];`;
  assert.deepEqual(configKeyPathsFromSource(src, 'sample'), ['db.host', 'db.name', 'env', 'list.0', 'list.1']);
});

test('configKeyPathsFromSource: throws on non-literal keys instead of under-reporting', () => {
  assert.throws(() => configKeyPathsFromSource(`<?php return [FOO => 1];`, 'sample'), /Unsupported config key/);
});

test('configKeyPathsFromSource: throws when there is no top-level return array', () => {
  assert.throws(() => configKeyPathsFromSource(`<?php $a = 1;`, 'sample'), /expected a top-level/);
  assert.throws(() => configKeyPathsFromSource(`<?php return getConfig();`, 'sample'), /not an array literal/);
});

test('compareConfigShape: reports missing and extra keys', () => {
  const r = compareConfigShape(['a', 'b', 'c'], ['a', 'c', 'd']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['b']);
  assert.deepEqual(r.extra, ['d']);
});

test('compareConfigShape: ok when shapes match exactly', () => {
  const r = compareConfigShape(['a', 'b'], ['a', 'b']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/deploy/`
Expected: FAIL — `Cannot find module ... preflight.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/deploy/preflight.mjs
// Pre-deploy safety checks: the protected-files set, the per-env target-path
// guard (the one FTP account reaches every environment), and the config.php
// key-shape check. config.php is *parsed* to an AST (php-parser) and its
// top-level `return [ ... ]` walked statically — never evaluated, so this
// needs no `php` binary and never executes a file fetched off a server. Key
// *values* never appear anywhere, so secrets can't leak into deploy output.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Engine from 'php-parser';
import { STATE_FILE } from './state.mjs';

// Files that live on the server and must never be uploaded or deleted (plus
// the state file, which this tool owns and writes separately).
export const PROTECTED = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd', STATE_FILE]);

// FTP_DIR must name the target env as its own path/subdomain segment, so a
// mistyped dir can never deploy to — or delete from! — the wrong environment.
const GUARDS = {
  test: /(^|[/.])test([/.]|$)/i,
  qa: /(^|[/.])qa([/.]|$)/i,
  prod: /(^|[/.])prod([/.]|$)/i,
};
export const TARGETS = Object.keys(GUARDS);

export function checkTargetDir(target, dir) {
  if (GUARDS[target].test(dir)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `Refusing to run: FTP_DIR="${dir}" does not look like the ${target.toUpperCase()} target. ` +
      `This account can reach other environments too, so deploy only runs against a path matching "${target}".`,
  };
}

const phpEngine = new Engine({ ast: { withPositions: false }, parser: { extractDoc: false } });

// Resolve an array-entry key node to its literal string form. PHP arrays index
// unkeyed entries by a running integer (max int key seen so far + 1, from 0),
// so we track that to stay faithful to how PHP would key a list-style array.
function literalKey(node, autoIndex) {
  if (node == null) {
    return { key: String(autoIndex.next), next: autoIndex.next + 1 };
  }
  if (node.kind === 'string') {
    return { key: String(node.value), next: autoIndex.next };
  }
  if (node.kind === 'number' && Number.isInteger(Number(node.value))) {
    const n = Number(node.value);
    return { key: String(n), next: Math.max(autoIndex.next, n + 1) };
  }
  throw new Error(`Unsupported config key: expected a string/int literal, got "${node.kind}".`);
}

// Recursively collect dotted key paths from a php-parser `array` node. An
// empty nested array contributes no keys (a branch with nothing in it).
function arrayKeyPaths(arrayNode, prefix, out) {
  const autoIndex = { next: 0 };
  for (const item of arrayNode.items) {
    if (item.kind !== 'entry' || item.unpack) {
      throw new Error(
        `Unsupported config construct: "${item.unpack ? 'spread' : item.kind}" (expected a plain array entry).`
      );
    }
    const { key, next } = literalKey(item.key, autoIndex);
    autoIndex.next = next;
    const full = prefix === '' ? key : `${prefix}.${key}`;
    if (item.value && item.value.kind === 'array') {
      arrayKeyPaths(item.value, full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// Flatten PHP config source to a sorted list of dotted key paths (e.g.
// "db.host") — never the values. Assumes config.php is a plain literal array
// (as it always is — see config/config.example.php); any dynamic construct
// throws a clear error rather than silently under-reporting keys.
export function configKeyPathsFromSource(src, label) {
  const program = phpEngine.parseCode(src, label);
  const ret = program.children.find((n) => n.kind === 'return');
  if (!ret || !ret.expr) {
    throw new Error(`${label}: expected a top-level "return [ ... ];".`);
  }
  if (ret.expr.kind !== 'array') {
    throw new Error(`${label}: top-level return is not an array literal — cannot read config key shape statically.`);
  }
  return arrayKeyPaths(ret.expr, '', []).sort();
}

export function configKeyPaths(file) {
  return configKeyPathsFromSource(readFileSync(file, 'utf8'), file);
}

// Pure comparison of two key-path lists (example = what the code expects,
// remote = what the server has).
export function compareConfigShape(exampleKeys, remoteKeys) {
  const remoteSet = new Set(remoteKeys);
  const exampleSet = new Set(exampleKeys);
  const missing = exampleKeys.filter((k) => !remoteSet.has(k));
  const extra = remoteKeys.filter((k) => !exampleSet.has(k));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

// Fetch the target's config.php and compare its key shape against
// config/config.example.php (the source of truth for what the deployed code
// expects). Best-effort on fetch: a brand-new environment has no config.php
// yet — the site can't run either way, so blocking wouldn't add protection
// there; report `skipped` and let the caller warn.
export async function checkConfigShape(client, remoteRoot) {
  const exampleKeys = configKeyPaths('config/config.example.php');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-config-'));
  const tmpConfig = path.join(tmpDir, 'config.php');
  try {
    try {
      await client.downloadTo(tmpConfig, `${remoteRoot}/config.php`);
    } catch (err) {
      return { ok: true, skipped: true, reason: err.message, missing: [], extra: [] };
    }
    return { skipped: false, ...compareConfigShape(exampleKeys, configKeyPaths(tmpConfig)) };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/deploy/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/deploy/preflight.mjs tools/deploy/preflight.test.mjs
git commit -m "feat(deploy): add preflight module (protected set, env guard, config shape)"
```

---

### Task 6: `ui.mjs` — step engine (TTY + CI renderers)

**Files:**
- Create: `tools/deploy/ui.mjs`
- Test: `tools/deploy/ui.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tools/deploy/ui.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bar, fmtDuration, humanBytes, createUI } from './ui.mjs';

function fakeStream() {
  return {
    chunks: [],
    write(s) {
      this.chunks.push(s);
    },
    text() {
      return this.chunks.join('');
    },
  };
}

test('bar: boundaries and arrow head', () => {
  assert.equal(bar(0, 10), `[${'-'.repeat(20)}]`);
  assert.equal(bar(10, 10), `[${'='.repeat(20)}]`);
  assert.equal(bar(5, 10), `[${'='.repeat(9)}>${'-'.repeat(10)}]`);
  assert.equal(bar(3, 0), `[${'-'.repeat(20)}]`); // no total -> empty bar, no crash
});

test('fmtDuration: seconds under a minute, m/s above', () => {
  assert.equal(fmtDuration(1400), '1.4s');
  assert.equal(fmtDuration(75000), '1m 15s');
});

test('humanBytes: B / KB / MB', () => {
  assert.equal(humanBytes(512), '512 B');
  assert.equal(humanBytes(2048), '2.0 KB');
  assert.equal(humanBytes(3 * 1024 * 1024), '3.0 MB');
});

test('non-TTY: start/done print plain sequential lines with note and duration', () => {
  const stream = fakeStream();
  let t = 0;
  const ui = createUI({ stream, isTTY: false, now: () => t });
  ui.plan([{ id: 'build', title: 'Build' }, { id: 'upload', title: 'Upload' }]);
  ui.start('build');
  t = 1500;
  ui.done('build', '6912 files');
  const out = stream.text();
  assert.match(out, /> Build/);
  assert.match(out, /OK Build — 6912 files \(1\.5s\)/);
  assert.ok(!out.includes('\x1b['), 'non-TTY output must contain no ANSI escapes');
  ui.close();
});

test('non-TTY: progress prints a heartbeat at most every heartbeatMs', () => {
  const stream = fakeStream();
  let t = 0;
  const ui = createUI({ stream, isTTY: false, now: () => t, heartbeatMs: 10000 });
  ui.plan([{ id: 'up', title: 'Upload' }]);
  ui.start('up');
  const before = stream.chunks.length;
  t = 5000;
  ui.progress('up', { done: 5, total: 10 });
  assert.equal(stream.chunks.length, before, 'no heartbeat before heartbeatMs');
  t = 10000;
  ui.progress('up', { done: 7, total: 10 });
  assert.match(stream.chunks.at(-1), /Upload: 7\/10/);
  t = 12000;
  ui.progress('up', { done: 8, total: 10 });
  assert.match(stream.chunks.at(-1), /7\/10/, 'no new heartbeat 2s after the last one');
  ui.close();
});

test('detail: printed only when verbose', () => {
  const quiet = fakeStream();
  const ui1 = createUI({ stream: quiet, isTTY: false, verbose: false });
  ui1.detail('+ file.js');
  assert.equal(quiet.text(), '');
  ui1.close();

  const loud = fakeStream();
  const ui2 = createUI({ stream: loud, isTTY: false, verbose: true });
  ui2.detail('+ file.js');
  assert.match(loud.text(), /\+ file\.js/);
  ui2.close();
});

test('TTY: redraws the step block in place with ANSI and renders a progress bar', () => {
  const stream = fakeStream();
  let t = 0;
  const ui = createUI({ stream, isTTY: true, now: () => t });
  ui.plan([{ id: 'a', title: 'Upload' }]);
  ui.start('a');
  ui.progress('a', { done: 5, total: 10 });
  const out = stream.text();
  assert.ok(out.includes('\x1b[1A'), 'redraw moves the cursor up over the block');
  assert.ok(out.includes('[========='), 'renders the bar');
  assert.ok(out.includes('5/10'), 'renders counts');
  ui.close();
});

test('fail: marks the active step and prints message + hint', () => {
  const stream = fakeStream();
  const ui = createUI({ stream, isTTY: false });
  ui.plan([{ id: 'a', title: 'Plan' }]);
  ui.start('a');
  ui.failActive('safety brake tripped', 'Re-run with --force-delete.');
  const out = stream.text();
  assert.match(out, /FAILED at Plan: safety brake tripped/);
  assert.match(out, /-> Re-run with --force-delete\./);
  ui.close();
});

test('skip and summary render', () => {
  const stream = fakeStream();
  const ui = createUI({ stream, isTTY: false });
  ui.plan([{ id: 'v', title: 'Verify' }]);
  ui.skip('v', 'nothing uploaded');
  ui.summary('TEST deploy done in 3.0s — 0 uploaded.');
  const out = stream.text();
  assert.match(out, /Verify — skipped \(nothing uploaded\)/);
  assert.match(out, /TEST deploy done in 3\.0s/);
  ui.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/deploy/`
Expected: FAIL — `Cannot find module ... ui.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/deploy/ui.mjs
// Terminal UI for the deploy tool: a live step plan with progress bars on a
// TTY, plain sequential lines otherwise (CI logs, tee, pipes). This is the
// ONLY module that writes to the terminal; it consumes step/progress events
// and holds no business logic. `now` is injected so timing is testable.
export function humanBytes(n) {
  if (n >= 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

export function fmtDuration(ms) {
  if (ms >= 60000) {
    const m = Math.floor(ms / 60000);
    return `${m}m ${Math.round((ms - m * 60000) / 1000)}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

// [=========>----------] — `width` cells, arrow head while partial.
export function bar(done, total, width = 20) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const filled = Math.round(ratio * width);
  if (filled <= 0) {
    return `[${'-'.repeat(width)}]`;
  }
  if (filled >= width) {
    return `[${'='.repeat(width)}]`;
  }
  return `[${'='.repeat(filled - 1)}>${'-'.repeat(width - filled)}]`;
}

const GLYPH = { pending: '□', active: '▶', done: '✓', skip: '·', fail: '✗' };
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];

export function createUI({
  stream = process.stdout,
  isTTY = stream.isTTY === true,
  verbose = false,
  now = () => Date.now(),
  heartbeatMs = 10000,
} = {}) {
  const steps = [];
  const byId = new Map();
  let drawn = 0; // lines the TTY block currently occupies
  let activeId = null;
  let ticker = null;
  let tick = 0;
  const beats = new Map(); // stepId -> time of its last non-TTY heartbeat

  const write = (s) => stream.write(s);

  function stepLine(s) {
    let mid = s.note || '';
    if (s.status === 'active') {
      if (s.progress && s.progress.total > 0) {
        const { done, total, extra } = s.progress;
        const pct = Math.floor((done / total) * 100);
        mid = `${bar(done, total)} ${String(pct).padStart(3)}% · ${done}/${total}${extra ? ` · ${extra}` : ''}`;
      } else {
        const note = s.progress?.note || s.note || '';
        mid = `${SPINNER[tick % SPINNER.length]} ${note}`.trim() + ` (${fmtDuration(now() - s.startedAt)})`;
      }
    } else if (s.status === 'done') {
      mid = `${s.note || ''}${s.note ? '  ' : ''}(${fmtDuration(s.endedAt - s.startedAt)})`;
    } else if (s.status === 'skip') {
      mid = `skipped${s.note ? ` (${s.note})` : ''}`;
    } else if (s.status === 'fail') {
      mid = s.note || 'failed';
    }
    return ` ${GLYPH[s.status]} ${s.title.padEnd(14)} ${mid}`.trimEnd();
  }

  function draw() {
    if (!isTTY || steps.length === 0) {
      return;
    }
    if (drawn > 0) {
      write(`\x1b[${drawn}A\x1b[0J`); // cursor up over the block, clear to end
    }
    const lines = steps.map(stepLine);
    write(`${lines.join('\n')}\n`);
    drawn = lines.length;
  }

  // Print a normal scrolling line: in TTY mode the step block is cleared
  // first and redrawn after, so the line lands ABOVE the live block.
  function lineOut(text) {
    if (isTTY && drawn > 0) {
      write(`\x1b[${drawn}A\x1b[0J`);
      drawn = 0;
      write(`${text}\n`);
      draw();
    } else {
      write(`${text}\n`);
    }
  }

  function startTicker() {
    if (!isTTY || ticker) {
      return;
    }
    ticker = setInterval(() => {
      tick++;
      draw();
    }, 100);
    if (ticker.unref) {
      ticker.unref();
    }
  }

  return {
    info(text) {
      lineOut(text);
    },
    // Per-file detail; silent unless --verbose (or dry-run, which the caller
    // maps to verbose).
    detail(text) {
      if (verbose) {
        lineOut(`    ${text}`);
      }
    },
    plan(defs) {
      for (const d of defs) {
        const s = { id: d.id, title: d.title, status: 'pending', note: '', progress: null, startedAt: 0, endedAt: 0 };
        steps.push(s);
        byId.set(d.id, s);
      }
      draw();
      startTicker();
    },
    start(id, note) {
      const s = byId.get(id);
      s.status = 'active';
      s.startedAt = now();
      if (note !== undefined) {
        s.note = note;
      }
      activeId = id;
      if (isTTY) {
        draw();
      } else {
        write(`> ${s.title}${s.note ? ` — ${s.note}` : ''}\n`);
      }
    },
    progress(id, p) {
      const s = byId.get(id);
      s.progress = p;
      if (isTTY) {
        draw();
        return;
      }
      const last = beats.get(id) ?? s.startedAt;
      if (now() - last >= heartbeatMs) {
        beats.set(id, now());
        write(`  ${s.title}: ${p.total > 0 ? `${p.done}/${p.total}` : p.note || 'working'}…\n`);
      }
    },
    done(id, note) {
      const s = byId.get(id);
      s.status = 'done';
      s.endedAt = now();
      if (note !== undefined) {
        s.note = note;
      }
      s.progress = null;
      if (id === activeId) {
        activeId = null;
      }
      if (isTTY) {
        draw();
      } else {
        write(`OK ${s.title}${s.note ? ` — ${s.note}` : ''} (${fmtDuration(s.endedAt - s.startedAt)})\n`);
      }
    },
    skip(id, note) {
      const s = byId.get(id);
      s.status = 'skip';
      if (note !== undefined) {
        s.note = note;
      }
      if (isTTY) {
        draw();
      } else {
        write(`-- ${s.title} — skipped${s.note ? ` (${s.note})` : ''}\n`);
      }
    },
    fail(id, message, hint) {
      const s = byId.get(id ?? activeId);
      if (s) {
        s.status = 'fail';
        s.endedAt = now();
        if (isTTY) {
          draw();
        }
      }
      lineOut(`\nFAILED${s ? ` at ${s.title}` : ''}: ${message}${hint ? `\n  -> ${hint}` : ''}`);
    },
    failActive(message, hint) {
      this.fail(activeId, message, hint);
    },
    summary(text) {
      lineOut(`\n${text}`);
    },
    close() {
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/deploy/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/deploy/ui.mjs tools/deploy/ui.test.mjs
git commit -m "feat(deploy): add step-list UI (TTY progress bars, plain CI logs)"
```

---

### Task 7: `cli.mjs` — entry point + pipeline orchestration

**Files:**
- Create: `tools/deploy/cli.mjs`
- Test: `tools/deploy/cli.test.mjs`

- [ ] **Step 1: Write the failing tests** (arg parsing is the pure part; the pipeline is covered by Task 11's manual integration)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/deploy/`
Expected: FAIL — `Cannot find module ... cli.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/deploy/cli.mjs
// Deploy CLI: build + MIRROR the code artifact (dist/build/) to an environment
// over plain FTP. Pipeline: build → preflight → scan → remote state → plan →
// upload → delete stale → verify → finalize. All printing goes through ui.mjs,
// all FTP through ftp.mjs, all diff decisions through sync.mjs (pure).
//
//   npm run deploy:test|qa|prod             full sync (upload + delete + verify)
//   npm run status:test|qa|prod             build-free: what's deployed?
//   flags (append after --): --dry-run --force --force-delete --relist
//                            --no-delete --verbose
//
// Exit codes: 0 ok, 1 failure, 2 refused by a guard or the safety brake.
import ftp from 'basic-ftp';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadDotEnv } from '../dotenv.mjs';
import { createUI, humanBytes, fmtDuration } from './ui.mjs';
import { parseConcurrency, classify, classifyWithList, brakeTrips, emptyDirsAfterDelete } from './sync.mjs';
import { listRemote, uploadFiles, deleteFiles, sweepEmptyDirs, verifyUploaded } from './ftp.mjs';
import { STATE_FILE, buildState, downloadState, uploadState } from './state.mjs';
import { walkBuild, fingerprint, writeDeploymentMarker } from './local.mjs';
import { PROTECTED, TARGETS, checkTargetDir, checkConfigShape } from './preflight.mjs';

const LOCAL_ROOT = 'dist/build';

// A refusal is a deliberate guard/brake stop (exit 2), distinct from a failure.
class Refusal extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
    this.exitCode = 2;
  }
}

export function parseArgs(argv) {
  const known = {
    '--dry-run': 'dryRun',
    '--force': 'force',
    '--force-delete': 'forceDelete',
    '--relist': 'relist',
    '--no-delete': 'noDelete',
    '--verbose': 'verbose',
    '--status': 'status',
  };
  const flags = { dryRun: false, force: false, forceDelete: false, relist: false, noDelete: false, verbose: false, status: false };
  let target = null;
  for (const a of argv) {
    if (a in known) {
      flags[known[a]] = true;
    } else if (a.startsWith('--')) {
      return { error: `Unknown flag: ${a}` };
    } else if (target) {
      return { error: `Unexpected argument: ${a}` };
    } else {
      target = a;
    }
  }
  if (!target || !TARGETS.includes(target)) {
    return {
      error: `Usage: npm run deploy:<${TARGETS.join('|')}> [-- --dry-run --force --force-delete --relist --no-delete --verbose]`,
    };
  }
  return { target, ...flags };
}

// Spawn the build (node tools/build.mjs) with output captured: a healthy
// build is one quiet step; the log streams through `onOutput` (shown only
// with --verbose) and is included in the error on failure.
function runBuild(onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/build.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const collect = (chunk) => {
      log += chunk;
      onOutput(chunk.toString());
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(log);
      } else {
        reject(new Error(`build failed (exit ${code}):\n${log}`));
      }
    });
  });
}

// Build-free status: read the state file header and print one line.
async function runStatus(target, accessOpts, remoteRoot) {
  const client = new ftp.Client();
  try {
    await client.access(accessOpts);
    const state = await downloadState(client, remoteRoot, accessOpts);
    if (!state) {
      console.log(`${target.toUpperCase()}: no ${STATE_FILE} on the server yet — the first deploy will bootstrap it.`);
      return;
    }
    const count = Object.keys(state.files || {}).length;
    console.log(
      `${target.toUpperCase()}: commit ${state.commit ?? '?'} — ${count} files — status ${state.status} — updated ${state.updatedAt}`
    );
  } finally {
    client.close();
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { target, dryRun, force, forceDelete, relist, noDelete, verbose, status } = parsed;
  const label = target.toUpperCase();

  // Env-specific values first (.env.<target>), shared rest from .env —
  // loadDotEnv never overwrites already-set vars, so env-specific wins.
  loadDotEnv(`.env.${target}`);
  loadDotEnv('.env');
  const missing = ['FTP_HOST', 'FTP_USER', 'FTP_PASS', 'FTP_DIR'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing FTP settings: ${missing.join(', ')} — set them in .env.${target} (copy .env.example).`);
    process.exit(1);
  }
  const remoteRoot = process.env.FTP_DIR;

  // Safety: the one FTP account reaches every environment; refuse unless the
  // target path clearly names the intended env.
  const guard = checkTargetDir(target, remoteRoot);
  if (!guard.ok) {
    console.error(guard.message);
    process.exit(2);
  }

  const accessOpts = { host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS, secure: false };
  const concurrency = parseConcurrency(process.env.FTP_CONCURRENCY);

  if (status) {
    await runStatus(target, accessOpts, remoteRoot);
    return;
  }

  const startedAt = Date.now();
  const ui = createUI({ verbose: verbose || dryRun });
  ui.info(`DEPLOY ${target} → ${process.env.FTP_HOST} ${remoteRoot}${dryRun ? '  (dry-run)' : ''}`);
  ui.plan([
    { id: 'build', title: 'Build' },
    { id: 'preflight', title: 'Preflight' },
    { id: 'scan', title: 'Scan' },
    { id: 'state', title: 'Remote state' },
    { id: 'plan', title: 'Plan' },
    { id: 'upload', title: 'Upload' },
    { id: 'delete', title: 'Delete stale' },
    { id: 'verify', title: 'Verify' },
    { id: 'finalize', title: 'Finalize' },
  ]);

  const client = new ftp.Client();
  try {
    // --- Build ------------------------------------------------------------
    ui.start('build');
    await runBuild((text) => text.split(/\r?\n/).filter(Boolean).forEach((l) => ui.detail(l)));
    if (!existsSync(LOCAL_ROOT)) {
      throw new Error(`build produced no ${LOCAL_ROOT}/`);
    }
    const marker = writeDeploymentMarker(target, LOCAL_ROOT);
    ui.done('build', `${LOCAL_ROOT}/ @ ${marker.shortCommit}`);

    // --- Preflight ----------------------------------------------------------
    ui.start('preflight');
    await client.access(accessOpts);
    await client.ensureDir(remoteRoot);
    const shape = await checkConfigShape(client, remoteRoot);
    if (shape.skipped) {
      ui.done('preflight', `guards OK · config.php not fetchable — check skipped (${shape.reason})`);
    } else if (shape.ok) {
      ui.done('preflight', 'guards OK · config shape OK');
    } else {
      shape.missing.forEach((k) => ui.info(`    config.php on ${label} is MISSING key: ${k}`));
      shape.extra.forEach((k) => ui.info(`    config.php on ${label} has EXTRA key:  ${k}`));
      if (dryRun) {
        ui.done('preflight', `config shape MISMATCH (${shape.missing.length} missing, ${shape.extra.length} extra) — dry-run reports only`);
      } else {
        throw new Refusal(
          `${label}'s config.php has drifted from config.example.php (${shape.missing.length} missing, ${shape.extra.length} extra keys — listed above).`,
          'Fix config.php by hand on the server, then re-run the deploy.'
        );
      }
    }

    // --- Scan ---------------------------------------------------------------
    ui.start('scan');
    const files = walkBuild(LOCAL_ROOT, PROTECTED);
    const localEntries = fingerprint(LOCAL_ROOT, files, (done, total) => ui.progress('scan', { done, total }));
    ui.done('scan', `${files.length} files hashed`);

    // --- Remote state ---------------------------------------------------------
    ui.start('state');
    const remoteState = await downloadState(client, remoteRoot, accessOpts);
    const authoritative = relist || !remoteState;
    let remoteSizes = null;
    let remoteDirs = [];
    if (authoritative) {
      const why = relist ? '--relist' : `no ${STATE_FILE} yet (bootstrap)`;
      const listed = await listRemote(remoteRoot, accessOpts, concurrency, (n) =>
        ui.progress('state', { note: `full LIST (${why}): ${n} directories walked` })
      );
      remoteSizes = listed.files;
      remoteDirs = listed.dirs;
      ui.done('state', `full LIST (${why}): ${remoteSizes.size} files in ${remoteDirs.length} dirs`);
    } else {
      ui.done('state', `${STATE_FILE} @ ${remoteState.commit ?? '?'} (${Object.keys(remoteState.files).length} files)`);
    }

    // --- Plan -----------------------------------------------------------------
    ui.start('plan');
    let { newFiles, changed, unchanged, stale } = authoritative
      ? classifyWithList(localEntries, remoteSizes, remoteState?.files, PROTECTED)
      : classify(localEntries, remoteState.files, PROTECTED);
    if (force) {
      changed = [...localEntries].map(([rel, e]) => ({ rel, size: e.size }));
      newFiles = [];
      unchanged = 0;
    }
    const toUpload = [...newFiles, ...changed];
    const deletions = noDelete ? [] : stale;
    const remoteCount = authoritative ? remoteSizes.size : Object.keys(remoteState.files).length;

    newFiles.forEach((f) => ui.detail(`+ ${f.rel}`));
    changed.forEach((f) => ui.detail(`~ ${f.rel}`));
    stale.forEach((rel) => ui.detail(`- ${rel}${noDelete ? '  (kept: --no-delete)' : ''}`));

    const planNote = `${newFiles.length} new, ${changed.length} changed, ${unchanged} unchanged, ${stale.length} stale`;
    const brake = deletions.length > 0 && brakeTrips(deletions.length, remoteCount) && !forceDelete;
    if (brake && !dryRun) {
      stale.forEach((rel) => ui.info(`    would delete: ${rel}`));
      throw new Refusal(
        `safety brake: this deploy would delete ${deletions.length} of ${remoteCount} remote files (>50 and >20%).`,
        'Check the deletion list above. If intended, re-run with --force-delete; otherwise investigate the build.'
      );
    }
    ui.done('plan', planNote + (brake ? ' — BRAKE would trip (--force-delete needed)' : ''));

    if (dryRun) {
      ['upload', 'delete', 'verify', 'finalize'].forEach((id) => ui.skip(id, 'dry-run'));
      ui.summary(`(dry-run) ${label}: ${planNote}${noDelete ? ', deletions disabled (--no-delete)' : ''}. No changes made.`);
      return;
    }

    // --- Upload -----------------------------------------------------------------
    ui.start('upload');
    // Track what's confirmed on the server this run: unchanged files are
    // already correct; uploaded files are added as they land. Drives the
    // resumable in-progress checkpoints of the state file.
    const toUploadSet = new Set(toUpload.map((f) => f.rel));
    const confirmed = new Map();
    for (const [rel, e] of localEntries) {
      if (!toUploadSet.has(rel)) {
        confirmed.set(rel, e);
      }
    }
    let uploadedCount = 0;
    let uploadedBytes = 0;
    const uploadStart = Date.now();
    // Throttled, serialized, best-effort checkpoint: a checkpoint failure
    // never fails the deploy (the final write is what counts); it just makes
    // a future resume redo a little more. Runs on the (otherwise idle) main
    // client while the upload pool works.
    const CHECKPOINT_EVERY = 1000;
    let sinceCheckpoint = 0;
    let checkpointChain = Promise.resolve();
    const onUploaded = (rel, size) => {
      confirmed.set(rel, localEntries.get(rel));
      uploadedCount++;
      uploadedBytes += size;
      const rate = uploadedBytes / Math.max(0.001, (Date.now() - uploadStart) / 1000);
      ui.progress('upload', { done: uploadedCount, total: toUpload.length, extra: `${humanBytes(rate)}/s` });
      if (++sinceCheckpoint >= CHECKPOINT_EVERY) {
        sinceCheckpoint = 0;
        const snapshot = buildState(target, marker.shortCommit, confirmed, 'in-progress');
        checkpointChain = checkpointChain
          .then(() => uploadState(client, remoteRoot, accessOpts, snapshot))
          .catch(() => {});
      }
    };
    if (toUpload.length) {
      // Mark the state in-progress before uploads begin, so an abort is
      // recognizable and a resume has a checkpoint to build on.
      await uploadState(client, remoteRoot, accessOpts, buildState(target, marker.shortCommit, confirmed, 'in-progress'));
      await uploadFiles(toUpload, LOCAL_ROOT, remoteRoot, accessOpts, Math.min(concurrency, toUpload.length), onUploaded);
      await checkpointChain; // flush any in-flight checkpoint before reusing the main client
      // The main client sat idle during the (possibly long) parallel upload;
      // the host may have dropped it. Re-establish before delete/verify/finalize.
      await client.access(accessOpts);
      ui.done('upload', `${toUpload.length} files (${humanBytes(uploadedBytes)})`);
    } else {
      ui.done('upload', 'nothing to upload — remote already up to date');
    }

    // --- Delete stale --------------------------------------------------------------
    let deletedFiles = 0;
    let removedDirs = 0;
    if (noDelete) {
      ui.skip('delete', `--no-delete — ${stale.length} stale file(s) left on the server`);
    } else if (deletions.length === 0) {
      ui.done('delete', 'nothing stale');
    } else {
      ui.start('delete');
      deletedFiles = await deleteFiles(deletions, remoteRoot, accessOpts, concurrency, (n) =>
        ui.progress('delete', { done: n, total: deletions.length })
      );
      // Sweep directories left empty, deepest-first (children before parents —
      // FTP can only RMD an EMPTY dir, so an empty subtree collapses
      // inside-out). Authoritative runs know every real dir (empties
      // included); the fast path derives candidates from the state file.
      const sweepDirs = authoritative ? remoteDirs : emptyDirsAfterDelete(deletions, Object.keys(remoteState.files));
      removedDirs = await sweepEmptyDirs(sweepDirs, remoteRoot, accessOpts, client, (attempted, removed) =>
        ui.progress('delete', { note: `sweeping dirs ${attempted}/${sweepDirs.length} (${removed} removed)` })
      );
      ui.done('delete', `${deletedFiles} files deleted, ${removedDirs} empty dirs removed`);
    }

    // --- Verify -----------------------------------------------------------------
    if (toUpload.length === 0) {
      ui.skip('verify', 'nothing uploaded');
    } else {
      ui.start('verify');
      const result = await verifyUploaded(remoteRoot, accessOpts, concurrency, toUpload);
      if (!result.ok) {
        result.missing.forEach((rel) => ui.info(`    MISSING   ${rel}`));
        result.mismatched.forEach((m) =>
          ui.info(`    TRUNCATED ${m.rel} (local ${humanBytes(m.local)}, remote ${humanBytes(m.remote)})`)
        );
        throw new Error(
          `verification failed — ${result.missing.length} missing, ${result.mismatched.length} truncated (listed above). ` +
            `State file left in-progress; re-run the deploy — resume re-sends only the shortfall.`
        );
      }
      ui.done('verify', `${toUpload.length} uploads match the server`);
    }

    // --- Finalize -----------------------------------------------------------------
    ui.start('finalize');
    await uploadState(client, remoteRoot, accessOpts, buildState(target, marker.shortCommit, localEntries, 'complete'));
    ui.done('finalize', `${STATE_FILE} @ ${marker.shortCommit} (${localEntries.size} files)`);

    ui.summary(
      `${label} deploy done in ${fmtDuration(Date.now() - startedAt)} — ` +
        `${toUpload.length} uploaded, ${deletedFiles} deleted, ${removedDirs} dirs removed, ${unchanged} unchanged.`
    );
  } catch (err) {
    ui.failActive(err.message, err.hint);
    process.exitCode = err.exitCode ?? 1;
  } finally {
    ui.close();
    client.close();
  }
}

// Run only when invoked directly (node tools/deploy/cli.mjs ...), not when
// imported (e.g. by cli.test.mjs exercising parseArgs).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass, and smoke-check the usage error**

Run: `node --test tools/deploy/`
Expected: PASS

Run: `node tools/deploy/cli.mjs bogus`
Expected: prints `Usage: npm run deploy:<test|qa|prod> ...` and exits 1 (check with `echo $LASTEXITCODE` in PowerShell / `echo $?` in bash)

- [ ] **Step 5: Commit**

```bash
git add tools/deploy/cli.mjs tools/deploy/cli.test.mjs
git commit -m "feat(deploy): add CLI orchestrator (mirror pipeline, brake, exit codes)"
```

---

### Task 8: Wire up `package.json`, delete the old tool

**Files:**
- Modify: `package.json` (scripts block)
- Delete: `tools/deploy.mjs`, `tools/deploy.test.mjs`

- [ ] **Step 1: Update the scripts block**

In `package.json`, replace the deploy-related scripts. Remove `deploy:test:prune`, `deploy:qa:prune`, `deploy:prod:prune`, `dryrun:test`, `dryrun:qa`, `dryrun:prod`, `sweep:test`, `sweep:qa`, `sweep:prod`. Change these entries (the build is now run BY the tool, so no `npm run build &&` prefix):

```json
    "deploy:test": "node tools/deploy/cli.mjs test",
    "deploy:qa": "node tools/deploy/cli.mjs qa",
    "deploy:prod": "node tools/deploy/cli.mjs prod",
    "status:test": "node tools/deploy/cli.mjs test --status",
    "status:qa": "node tools/deploy/cli.mjs qa --status",
    "status:prod": "node tools/deploy/cli.mjs prod --status",
```

And point the JS test runner at the new directory:

```json
    "test:js": "node --test tools/deploy/",
```

- [ ] **Step 2: Delete the old tool (this intentionally discards the uncommitted overhaul — all kept logic was harvested into tools/deploy/ in Tasks 1–7)**

```bash
git rm -f tools/deploy.mjs tools/deploy.test.mjs
```

- [ ] **Step 3: Verify the suite and scripts**

Run: `npm run test:js`
Expected: PASS (all tools/deploy/*.test.mjs, old test file gone)

Run: `npm run guard`
Expected: PASS (secret guard unaffected)

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(deploy)!: switch npm scripts to the new deploy CLI, drop prune/dryrun/sweep families"
```

---

### Task 9: CI workflows — drop `prune`, adapt the summary

**Files:**
- Modify: `.github/workflows/_deploy.yml`
- Modify: `.github/workflows/deploy-test.yml`, `.github/workflows/deploy-qa.yml`, `.github/workflows/deploy-prod.yml`
- Modify: `.github/workflows/ci.yml` (comment only)

- [ ] **Step 1: `_deploy.yml` — remove the `prune` input and flag, update the summary grep**

Remove from the `workflow_call.inputs` block:

```yaml
      prune:
        type: boolean
        default: false
```

In the "Deploy over FTP" step, remove the line:

```yaml
            ${{ inputs.prune && '--prune' || '' }} \
```

In the "Summary" step, change the flags line to:

```yaml
            echo "- Flags: dry-run=${{ inputs.dry_run }}, force=${{ inputs.force }}"
```

and change the grep (the old tool printed `Compared with remote:`; the new tool's stable final line contains `deploy done in`, and dry-runs print a `(dry-run)` summary):

```yaml
              grep -E 'deploy done in|\(dry-run\)' deploy-output.log || true
```

- [ ] **Step 2: `deploy-test.yml`, `deploy-qa.yml`, `deploy-prod.yml` — remove the prune input**

In **each** of the three files, remove the input block:

```yaml
      prune:
        description: "Pass --prune to delete stale remote files the build no longer produces"
        type: boolean
        default: false
```

and the pass-through line in the `deploy` job's `with:` block:

```yaml
      prune: ${{ inputs.prune }}
```

- [ ] **Step 3: `ci.yml` — fix the stale comment above the `deploy-test` job (lines ~138–142)**

Replace:

```yaml
  # Auto-deploy the built artifact to the TEST staging site on merge to main,
  # only after every other job is green. The FTP account can also reach qa/prod,
  # so: secrets live in the `test` GitHub Environment (add protection rules
  # there), deploy-test hard-refuses any target path without "test", and --prune
  # is never passed here (destructive deletes stay manual/local).
```

with:

```yaml
  # Auto-deploy the built artifact to the TEST staging site on merge to main,
  # only after every other job is green. The FTP account can also reach qa/prod,
  # so: secrets live in the `test` GitHub Environment (add protection rules
  # there), deploy-test hard-refuses any target path without "test", and the
  # mirror's deletions are bounded by the mass-delete safety brake (exit 2).
```

- [ ] **Step 4: Sanity-check YAML and commit**

Run: `node -e "const y=require('node:fs').readFileSync('.github/workflows/_deploy.yml','utf8'); if (/prune/.test(y)) throw new Error('prune still referenced');"` and the same one-liner for the three `deploy-*.yml` files.
Expected: no output (exit 0) for each.

```bash
git add .github/workflows/_deploy.yml .github/workflows/deploy-test.yml .github/workflows/deploy-qa.yml .github/workflows/deploy-prod.yml .github/workflows/ci.yml
git commit -m "ci(deploy): drop prune input (mirror is default, brake-guarded), adapt summary to new CLI"
```

---

### Task 10: Documentation — CLAUDE.md, staging/README.md, .env.example, old spec

**Files:**
- Modify: `CLAUDE.md` (deployment bullets; the file carries uncommitted edits — this task supersedes them)
- Modify: `staging/README.md` (~lines 52–57)
- Modify: `.env.example` (FTP_CONCURRENCY comment)
- Add: `docs/superpowers/specs/2026-07-24-resilient-parallel-deploy-sync-state-design.md` (commit the superseded spec for the record — the 2026-07-25 spec references it)

- [ ] **Step 1: CLAUDE.md — replace the deploy-tooling bullets**

In the **Tech Stack** section, replace the three bullets titled "**Automated TEST deploy (optional):**", "**Sync-state manifest (`.sync-state.json`):**", "**npm scripts (never call `node tools/deploy.mjs` directly):**", and "**Deploy flags:**" with:

```markdown
- **Automated deploy (`npm run deploy:<env>`):** `tools/deploy/cli.mjs` builds
  and then **mirrors** `dist/build/` to the target server over plain FTP (creds
  from a git-ignored `.env.<env>`, falling back to `.env`; see `.env.example`):
  uploads new/changed files (changed = different **sha256 content hash**),
  deletes stale remote files, and removes directories left empty —
  **deepest-first, children before parents** (FTP can only delete empty dirs).
  A **mass-delete safety brake** refuses the deploy (exit 2) when it would
  delete both >50 files and >20% of the remote tree — after checking the plan,
  override with `-- --force-delete`. Server-owned files (`.htaccess`,
  `robots.txt`, `config.php`, `.htpasswd`) and the tool-owned
  `.sync-state.json` are never uploaded and never deleted. Every bulk phase
  (LIST/upload/delete/verify) fans out over `FTP_CONCURRENCY` connections
  (default 6, clamped 1-8) and every FTP op retries with exponential-backoff
  reconnect — the host is flaky under concurrency. Output is a live step list
  with progress bars on a TTY and plain sequential lines when piped/in CI.
- **Sync state (`.sync-state.json`):** each deploy writes a manifest at the
  site root (deployed path → `{size, sha256}` plus commit/status). Routine
  deploys diff against that one small file — **no recursive remote LIST** — and
  an aborted deploy is resumable (checkpointed during upload, finalized at the
  end). The full parallel LIST runs only on bootstrap (no state file) or
  `-- --relist` (reconcile against the server's real tree — also the only way
  deletion can see files the tool didn't itself deploy; routine deletion is
  state-file-based, so it can never remove more than what the tool put there).
- **Deploy commands (never call `node tools/deploy/cli.mjs` directly):**
  `deploy:<env>` (build + mirror + verify) and the build-free `status:<env>`
  (state header: commit, file count, status, updated-at), `<env>` =
  `test`|`qa`|`prod`. Flags appended after `--`: `--dry-run` (full plan incl.
  file lists, changes nothing), `--force` (re-upload everything),
  `--force-delete` (override the brake), `--relist` (authoritative LIST),
  `--no-delete` (skip deletion this once), `--verbose` (per-file detail). After
  upload it verifies every file landed at the right byte size (LISTing only
  the touched directories) and exits non-zero on any shortfall. Exit codes:
  0 ok, 1 failure, 2 refused by a guard/brake. Each target hard-refuses unless
  its `FTP_DIR` matches the env name, so a mistyped dir can never deploy to
  (or delete from!) the wrong environment.
```

- [ ] **Step 2: CLAUDE.md — fix remaining stale references**

Run: `grep -n -- '--prune\|dryrun:\|sweep:\|deploy\.mjs' CLAUDE.md` and fix every hit. Known ones:
- In the "**TEST / QA / PROD deploy (independent, tag-based):**" bullet, change `each with `dry_run`/`prune`/`force` boolean inputs (mirroring `deploy.mjs`'s CLI flags of the same names — `--no-verify` deliberately excluded)` to `each with `dry_run`/`force` boolean inputs (deletion is on by default, bounded by the deploy CLI's mass-delete safety brake)`.
- In the "**CI auto-deploy to TEST:**" bullet, change `the per-target path guard applies in CI and `--prune` is never used there` to `the per-target path guard applies in CI and the mass-delete safety brake bounds the mirror's deletions`.
- In the "**Deployment (auto TEST, tag-promoted TEST/QA/PROD)**" bullet and anywhere else, replace mentions of `deploy.mjs` with `the deploy CLI (tools/deploy/)`.
- Update the "**Deployment marker:**" bullet's parenthetical `(a SHA is a fixed length, so the size-based change check would otherwise skip it)` to `(its content hash changes every run, so it re-uploads naturally)` and drop the words "force-uploaded" in favor of "re-uploaded".

- [ ] **Step 3: staging/README.md — update the manual-fallback flags (lines ~52–57)**

Replace the sentence starting `Flags: \`-- --dry-run\` (preview new/changed/unchanged/stale — run before pruning), \`-- --prune\` ...` with:

```markdown
   Flags: `-- --dry-run` (preview the full plan — new/changed/unchanged/stale —
   without changing anything), `-- --force` (re-upload everything),
   `-- --force-delete` (override the mass-delete safety brake after checking
   the plan), `-- --no-delete` (skip deletion once). Deletion of stale
   files/dirs is part of every deploy by default.
```

Then run `grep -n -- '--prune\|dryrun:\|sweep:' staging/README.md` and fix any remaining hits the same way.

- [ ] **Step 4: .env.example — refresh the FTP_CONCURRENCY comment**

Replace:

```
# Parallel upload connections (optional). Default 6, clamped 1-8. Higher =
# faster on many-file deploys (e.g. the Laravel vendor tree); set 1 to force
# the old serial upload if the host limits concurrent FTP connections.
```

with:

```
# Parallel FTP connections (optional) used by every bulk deploy phase
# (list/upload/delete/verify). Default 6, clamped 1-8; set 1 for fully serial
# transfers if the host limits concurrent FTP connections.
```

- [ ] **Step 5: Commit (including the superseded 2026-07-24 spec, for the record)**

```bash
git add CLAUDE.md staging/README.md .env.example docs/superpowers/specs/2026-07-24-resilient-parallel-deploy-sync-state-design.md
git commit -m "docs(deploy): document the rewritten deploy CLI (mirror default, brake, new flags)"
```

---

### Task 11: Manual integration verification against TEST

No files. Requires `.env.test` (or `.env`) with real TEST credentials. **Run each step and read the output before the next.**

- [ ] **Step 1: Dry-run**

Run: `npm run deploy:test -- --dry-run`
Expected: step list renders (Build → … → Plan), plan counts printed, per-file `+`/`~`/`-` lines (dry-run implies verbose), remaining steps marked skipped, final line `(dry-run) TEST: N new, M changed, K unchanged, D stale. No changes made.`, exit 0. An existing `.sync-state.json` written by the old tool must be accepted (fast path, no full LIST).

- [ ] **Step 2: Real deploy**

Run: `npm run deploy:test`
Expected: full pipeline with live progress; summary `TEST deploy done in Xs — N uploaded, D deleted, R dirs removed, K unchanged.`; exit 0. Spot-check the site in a browser and `/deployment.json` shows the new commit.

- [ ] **Step 3: Status**

Run: `npm run status:test`
Expected: one line — `TEST: commit <short-sha> — <count> files — status complete — updated <ISO time>`.

- [ ] **Step 4: Idempotence**

Run: `npm run deploy:test` again immediately.
Expected: `Upload — nothing to upload` (only `deployment.json` re-uploads — its content changes every build), `Delete stale — nothing stale`, quick finish.

- [ ] **Step 5: Resume after abort**

Run: `npm run deploy:test -- --force` and press Ctrl-C mid-upload (after at least one `checkpoint` — i.e. >1,000 files in). Then re-run **without** `--force`: `npm run deploy:test`.
Expected: the second run's Plan shows far fewer files to upload than the ~7,000 the first run was sending (files confirmed before the last checkpoint diff as unchanged), and it finishes with `status complete`.

- [ ] **Step 6: Full check suite**

Run: `npm run check`
Expected: PASS (includes `test:js` over `tools/deploy/`).

- [ ] **Step 7: Commit nothing — verify clean tree**

Run: `git status --short`
Expected: no unexpected modified files (only untracked leftovers you know about, ideally nothing).

---

## Self-review checklist (run after writing, fixed inline)

- Spec coverage: commands/flags (T7/T8), pipeline steps 1–9 (T7), brake semantics both->50/20% (T1), inside-out dir deletion (T1/T2), 550-as-already-gone deletion (T2), state fast path + bootstrap/relist (T3/T7), TTY/CI/verbose output modes + heartbeat (T6), exit codes 0/1/2 (T7), CI input changes + summary grep (T9), docs (T10), manual integration incl. resume (T11). No gaps found.
- Placeholders: none — every module and test is complete code.
- Type consistency: `classify`/`classifyWithList` take `protectedSet` and return `{newFiles, changed, unchanged, stale}`; `uploadFiles(toUpload, localRoot, remoteRoot, accessOpts, workers, onDone)` matches T7's call; `buildState(environment, commit, entries, status)` matches T7's `buildState(target, marker.shortCommit, ...)`; `checkConfigShape(client, remoteRoot)` returns `{ok, skipped, reason?, missing, extra}` as consumed in T7.
