# Deploy Tooling Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FTP deploys fast (parallel uploads), let `--prune` clean up emptied directories, and make `npm run build` fast/flake-resistant with a persistent Composer cache.

**Architecture:** Three independent tooling changes. `tools/deploy.mjs` gains a small pure concurrency primitive (`runPool`) plus `parseConcurrency` and `emptyDirsAfterPrune` helpers, all `export`ed and unit-tested with Node's built-in `node --test`; its upload phase becomes a worker pool of N `basic-ftp` connections, and `--prune` removes emptied directories via `removeEmptyDir` (RMD, which is self-protecting against non-empty dirs). `tools/build.mjs` points Composer's cache at a repo-local dir.

**Tech Stack:** Node ESM tooling, `basic-ftp`, `node --test` (new, zero-dependency), Docker Composer, cross-platform (Windows + POSIX).

## Global Constraints

- Cross-platform (Windows + POSIX); match existing `deploy.mjs`/`build.mjs` style.
- FTP-only; no server-side execution added.
- **PROTECTED files never uploaded/pruned:** `.htaccess`, `robots.txt`, `config.php`, `.htpasswd` (existing `PROTECTED` set).
- Per-target dir guard, config-shape pre-flight, and post-upload byte-size verification stay behaviorally unchanged.
- `--dry-run` changes nothing on the server.
- `FTP_CONCURRENCY`: default **4**, clamped **1–8**.
- New pure helpers are `export`ed from `deploy.mjs`; importing `deploy.mjs` must NOT run the CLI (already guarded by the `import.meta.url === pathToFileURL(process.argv[1]).href` check at the bottom).

## Spec

Full design: `docs/superpowers/specs/2026-07-23-deploy-tooling-improvements-design.md`.

## Environment / testing notes

- `npm run test:js` (added in Task 1) runs `node --test tools/` and works locally on Windows — no Docker/DB/FTP needed.
- **Live FTP behavior (parallel upload landing files, real empty-dir removal) cannot be tested locally** — there is no local FTP server. Those are verified by the pure unit tests plus a real `deploy:test` run the user performs. Each task notes what is unit-tested vs. deferred to a live deploy.
- Task 4 (Composer cache) is verifiable locally with Docker up.

---

### Task 1: Test harness + upload-pool pure helpers (`parseConcurrency`, `runPool`)

**Files:**
- Modify: `package.json` (add `test:js` script; add it to `check`)
- Modify: `tools/deploy.mjs` (export two pure helpers)
- Create: `tools/deploy.test.mjs`

**Interfaces:**
- Produces: `export function parseConcurrency(raw): number` and `export async function runPool(items, concurrency, worker): Promise<void>`. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `tools/deploy.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/deploy.test.mjs`
Expected: FAIL — `parseConcurrency`/`runPool` are not exported (import throws or values are `undefined`).

- [ ] **Step 3: Add the helpers to `deploy.mjs`**

In `tools/deploy.mjs`, add near the other pure helpers (e.g. just above `async function run(` / the `main`-style function):

```js
// Parse FTP_CONCURRENCY: default 4, clamped to 1..8 (stays under the typical
// shared-host connection cap; =1 reproduces the old serial upload).
export function parseConcurrency(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 4;
  }
  return Math.min(8, Math.max(1, n));
}

// Run `worker(item, index)` across up to `concurrency` coopered workers pulling
// from a shared cursor. Pure w.r.t. I/O (worker is injected). Fail-fast: the
// first worker rejection stops new items from starting and rejects the pool.
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
```

- [ ] **Step 4: Add the `test:js` script and wire it into `check`**

In `package.json` `scripts`, add:

```json
"test:js": "node --test tools/",
```

and insert `npm run test:js && ` into the `check` script immediately before `npm run lint:js` so it reads:

```
"check": "npm run build:assets && npm run lint:php && npm run test:php && npm run test:js && npm run lint:js && npm run lint:css && npm run format:check && npm run guard",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tools/deploy.test.mjs`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add tools/deploy.mjs tools/deploy.test.mjs package.json
git commit -m "test(deploy): add node --test harness with parseConcurrency and runPool"
```

---

### Task 2: Parallel FTP upload in `deploy.mjs`

**Files:**
- Modify: `tools/deploy.mjs` (upload phase → worker pool)
- Modify: `.env.example` (document `FTP_CONCURRENCY`)

**Interfaces:**
- Consumes: `parseConcurrency`, `runPool` (Task 1).
- The pre-flight, `listRemote`, `verifyUpload`, and prune phases keep using the existing single `client`; only the upload loop changes.

- [ ] **Step 1: Replace the serial upload loop with a worker pool**

In `tools/deploy.mjs`, the current upload block (the `byDir` build + the `for (const [d, files] of byDir)` serial loop, ending before the `if (PRUNE)` block) becomes:

```js
    // Upload, grouped by remote directory so each connection ensureDir's once
    // per folder. Parallelised across a small pool of connections: per-file FTP
    // round-trip latency — not bandwidth — dominates, so N connections give a
    // near-linear speedup. Every dir op uses an ABSOLUTE ${remoteRoot}/${dir}
    // path (ensureDir resets to root for absolute paths), so the independent
    // connections never clobber each other's working directory.
    const byDir = new Map();
    for (const f of toUpload) {
      const d = path.posix.dirname(f.rel);
      if (!byDir.has(d)) {
        byDir.set(d, []);
      }
      byDir.get(d).push(f);
    }
    const batches = [...byDir.entries()];
    const workers = Math.max(1, Math.min(parseConcurrency(process.env.FTP_CONCURRENCY), batches.length || 1));
    const accessOpts = { host: FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS, secure: false };

    if (toUpload.length) {
      const pool = [];
      for (let i = 0; i < workers; i++) {
        const c = new ftp.Client();
        await c.access(accessOpts);
        pool.push(c);
      }
      const free = [...pool];
      let done = 0;
      try {
        await runPool(batches, workers, async ([d, files]) => {
          const c = free.pop();
          try {
            const remoteDir = d === '.' ? remoteRoot : `${remoteRoot}/${d}`;
            await c.ensureDir(remoteDir);
            for (const f of files) {
              done++;
              console.log(`  [${done}/${toUpload.length}] ${f.rel}`);
              await c.uploadFrom(path.join(LOCAL_ROOT, f.rel), path.posix.basename(f.rel));
            }
          } finally {
            free.push(c);
          }
        });
      } finally {
        pool.forEach((c) => c.close());
      }
    }
    console.log(toUpload.length ? `Uploaded ${toUpload.length} file(s) (concurrency ${workers}).` : 'Nothing to upload — remote already up to date.');
```

Notes for the implementer:
- `parseConcurrency` and `runPool` are already imported? They are in the same module — reference them directly (they are defined/`export`ed in this file).
- `free.pop()` is safe: `runPool` runs exactly `workers` concurrent invocations and the pool holds `workers` clients, so a client is always available when a worker starts a batch (single-threaded event loop; a client is only checked out for the duration of one batch).
- Do not touch the `if (PRUNE)` block or the verification block in this task.

- [ ] **Step 2: Document `FTP_CONCURRENCY` in `.env.example`**

After the `FTP_DIR=CHANGE_ME` line in `.env.example`, add:

```
# Parallel upload connections (optional). Default 4, clamped 1-8. Higher =
# faster on many-file deploys (e.g. the Laravel vendor tree); set 1 to force
# the old serial upload if the host limits concurrent FTP connections.
FTP_CONCURRENCY=4
```

- [ ] **Step 3: Syntax + unit-test regression check**

Run: `node --check tools/deploy.mjs && node --test tools/deploy.test.mjs`
Expected: no syntax error; Task 1 tests still PASS (this task adds no new unit test — the pool wiring is integration code exercised live).

- [ ] **Step 4: Live verification (record, do not block the task on infra you lack)**

The parallel upload lands files only against a real FTP server. Verify with a real run when available:
Run: `npm run deploy:test` (then confirm the existing post-upload byte-size verification prints `Verified N uploaded file(s)`).
If no FTP target is reachable in this environment, note in the report that live verification is deferred to the user's `deploy:test`, and rely on `node --check` + the Task 1 unit tests for this task's automated gate.

- [ ] **Step 5: Commit**

```bash
git add tools/deploy.mjs .env.example
git commit -m "perf(deploy): upload over a pool of parallel FTP connections"
```

---

### Task 3: Prune empty directories (`--prune`)

**Files:**
- Modify: `tools/deploy.mjs` (`emptyDirsAfterPrune` helper + dry-run prediction + real prune)
- Modify: `tools/deploy.test.mjs` (tests for the helper)

**Interfaces:**
- Produces: `export function emptyDirsAfterPrune(stalePaths, remoteFiles): string[]` — deepest-first list of directory rel-paths that hold no surviving file once `stalePaths` are removed.

- [ ] **Step 1: Write the failing test**

Add to `tools/deploy.test.mjs`:

```js
import { emptyDirsAfterPrune } from './deploy.mjs';

test('emptyDirsAfterPrune: dir with only stale files is listed', () => {
  const stale = ['old/a.js', 'old/b.js'];
  const remote = ['old/a.js', 'old/b.js', 'keep/c.js'];
  assert.deepEqual(emptyDirsAfterPrune(stale, remote), ['old']);
});

test('emptyDirsAfterPrune: dir with a surviving file is NOT listed', () => {
  const stale = ['mix/old.js'];
  const remote = ['mix/old.js', 'mix/keep.js'];
  assert.deepEqual(emptyDirsAfterPrune(stale, remote), []);
});

test('emptyDirsAfterPrune: nested empties are deepest-first', () => {
  const stale = ['a/b/c/x.js', 'a/b/c/y.js'];
  const remote = ['a/b/c/x.js', 'a/b/c/y.js'];
  assert.deepEqual(emptyDirsAfterPrune(stale, remote), ['a/b/c', 'a/b', 'a']);
});

test('emptyDirsAfterPrune: partial nesting keeps the surviving ancestor', () => {
  const stale = ['a/b/c/x.js'];
  const remote = ['a/b/c/x.js', 'a/keep.js'];
  // a/b/c and a/b become empty; a survives (has keep.js)
  assert.deepEqual(emptyDirsAfterPrune(stale, remote), ['a/b/c', 'a/b']);
});

test('emptyDirsAfterPrune: root-level stale files yield no dirs', () => {
  assert.deepEqual(emptyDirsAfterPrune(['x.js'], ['x.js', 'y.js']), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/deploy.test.mjs`
Expected: FAIL — `emptyDirsAfterPrune` not exported.

- [ ] **Step 3: Implement the helper**

In `tools/deploy.mjs`, near the other pure helpers:

```js
// Directories that hold no surviving file once `stalePaths` are removed, given
// the full pre-prune remote file list `remoteFiles` (both posix rel-paths).
// Returned deepest-first so a parent is only removed after its children. Used
// for both the --dry-run prediction and to order real removeEmptyDir calls.
export function emptyDirsAfterPrune(stalePaths, remoteFiles) {
  const staleSet = new Set(stalePaths);
  const survivors = remoteFiles.filter((f) => !staleSet.has(f));
  const candidates = new Set();
  for (const rel of stalePaths) {
    let dir = path.posix.dirname(rel);
    while (dir && dir !== '.') {
      candidates.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  const empty = [...candidates].filter((dir) => !survivors.some((s) => s.startsWith(`${dir}/`)));
  empty.sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
  return empty;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/deploy.test.mjs`
Expected: PASS (all Task 1 + Task 3 tests).

- [ ] **Step 5: Wire the dry-run prediction**

In `tools/deploy.mjs`, inside the `if (stale.length) { ... }` block that prints the stale list (right after the `stale.forEach(...)` line), add the prune-only prediction:

```js
      if (PRUNE) {
        const emptyDirs = emptyDirsAfterPrune(stale, [...remote.keys()]);
        if (emptyDirs.length) {
          console.log('  EMPTY DIRECTORIES after prune — will be removed:');
          emptyDirs.forEach((d) => console.log(`    - ${d}/`));
        }
      }
```

(This prints for both dry-run and real runs, before the `if (DRY_RUN) return;` early exit — so `--prune --dry-run` shows the prediction and changes nothing.)

- [ ] **Step 6: Wire the real removal**

In the `if (PRUNE) { ... }` block, after the stale-file removal loop and its `Pruned N file(s).` log, add:

```js
      const emptyDirs = emptyDirsAfterPrune(stale, [...remote.keys()]);
      let removedDirs = 0;
      for (const d of emptyDirs) {
        try {
          await client.removeEmptyDir(`${remoteRoot}/${d}`);
          console.log(`  removing empty dir ${d}/`);
          removedDirs++;
        } catch {
          // RMD fails on a non-empty dir (a surviving file, or a PROTECTED file
          // like .htaccess kept on the server) — expected; skip it.
        }
      }
      if (removedDirs) {
        console.log(`Removed ${removedDirs} empty director${removedDirs === 1 ? 'y' : 'ies'}.`);
      }
```

- [ ] **Step 7: Syntax check + unit tests**

Run: `node --check tools/deploy.mjs && node --test tools/deploy.test.mjs`
Expected: no syntax error; all unit tests PASS. (Live removal is verified by the user's real `deploy:test -- --prune`; note that in the report.)

- [ ] **Step 8: Commit**

```bash
git add tools/deploy.mjs tools/deploy.test.mjs
git commit -m "feat(deploy): prune empty directories after removing stale files"
```

---

### Task 4: Persistent Composer cache (`build.mjs`)

**Files:**
- Modify: `tools/build.mjs` (add `COMPOSER_CACHE_DIR` env to the three Docker composer runs)
- Modify: `.gitignore` (ignore `/.composer-cache/`)

**Interfaces:** none consumed/produced by other tasks.

- [ ] **Step 1: Add the cache env to each Docker composer invocation**

The repo is already mounted at `/app` in every composer container, so the cache lives under the mount at `/app/.composer-cache`. Add these two array elements — `'-e'`, `'COMPOSER_CACHE_DIR=/app/.composer-cache'` — to the `docker run` args of **all three** composer invocations in `tools/build.mjs`:
1. the old-app `composer install` (the one with `COMPOSER_VENDOR_DIR=dist/build/vendor`),
2. the old-app `composer dump-autoload`,
3. the api `composer install` (`-w /app/dist/build/api`).

For each, insert them right after the existing `-w`/working-dir pair (before the `'composer:2'` image argument). Example for the api install:

```js
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app/dist/build/api',
    '-e',
    'COMPOSER_CACHE_DIR=/app/.composer-cache',
    'composer:2',
    'install',
    '--no-dev',
    '--optimize-autoloader',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);
```

Apply the same `'-e', 'COMPOSER_CACHE_DIR=/app/.composer-cache'` insertion to the other two composer `docker run` calls (the old-app `install` already has an `-e COMPOSER_VENDOR_DIR=...`; add the cache `-e` alongside it).

- [ ] **Step 2: Ignore the cache directory**

Add to `.gitignore` (near the other build/cache entries, e.g. after `/vendor/`):

```
# Persistent Composer download cache reused across builds (tools/build.mjs)
/.composer-cache/
```

- [ ] **Step 3: Verify the cache is populated and reused**

Run: `npm run build`
Expected: build completes; `.composer-cache/` now exists at the repo root with cached files:
Run: `ls .composer-cache`  → non-empty (e.g. a `files/`/`repo/` subtree).

Run: `npm run build` again
Expected: the api composer step reports reuse rather than re-downloading (no "Downloading" for every package; much faster second run). Confirm `git status` does NOT list `.composer-cache/` (it is ignored).

- [ ] **Step 4: Commit**

```bash
git add tools/build.mjs .gitignore
git commit -m "build: reuse a persistent Composer cache across builds"
```

---

## Self-Review

- **Spec coverage:** Component A (parallel upload) → Tasks 1–2; Component B (prune empty dirs) → Task 3; Component C (Composer cache) → Task 4. The spec's "introduce `node --test`" → Task 1. ✓
- **Placeholder scan:** every step has concrete code/commands; no TBD/TODO. ✓
- **Type/name consistency:** `parseConcurrency`, `runPool`, `emptyDirsAfterPrune` are defined in Task 1/3 and referenced with the same names/signatures in Task 2/3 wiring. `FTP_CONCURRENCY` name consistent across `.env.example`, `parseConcurrency`, and the pool. ✓
- **Testability honesty:** pure helpers are unit-tested locally (`node --test`); live FTP behavior (parallel landing, real `removeEmptyDir`) is explicitly deferred to a real `deploy:test` and flagged as such — not silently claimed. Composer cache is locally verifiable. ✓
- **Safety:** `removeEmptyDir` (RMD) is self-protecting; PROTECTED files/dirs and `remoteRoot` are never removed; `--dry-run` changes nothing. ✓
