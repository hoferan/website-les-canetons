# Deploy Tooling Improvements — Design

## Context

The first Laravel deploy uploaded ~6478 files over FTP, which was extremely slow. Investigation showed the cause is not Laravel's file count per se but how `tools/deploy.mjs` uploads: a **single** `basic-ftp` connection uploading **one file at a time** ([deploy.mjs](../../../tools/deploy.mjs) upload loop), so per-file round-trip latency dominates. Separately, `tools/build.mjs` re-downloads all of the Laravel `api/` Composer packages on every build with no cache (occasionally failing on transient "corrupted zip" downloads), and `--prune` removes stale files but leaves empty directories behind.

This spec covers three focused improvements to the deploy/build tooling. Each is independent and independently testable.

**Out of scope:** the zip-upload + server-side self-extract idea (considered and deferred — higher shared-hosting risk for a payoff that mostly matters on the few full-vendor uploads); parallelising the pre-scan / verify `LIST` phase (deferred — it is `LIST`-per-directory, not the bottleneck, and is cheap on the initial deploy because the remote is nearly empty).

## Global Constraints

- Node ESM tooling at the repo root; cross-platform (Windows + POSIX). Match the existing `deploy.mjs`/`build.mjs` style.
- FTP-only deploy to `easy-hebergement.net` shared hosting; no SSH, no server-side execution added.
- **PROTECTED files are never uploaded and never pruned:** `.htaccess`, `robots.txt`, `config.php`, `.htpasswd` (existing `PROTECTED` set in `deploy.mjs`).
- Per-target dir guard, config-shape pre-flight, and post-upload byte-size verification stay intact and unchanged in behavior.
- `--dry-run` changes nothing on the server.
- Match production versions (PHP 8.4, MariaDB 10.3) — unaffected here.

---

## Component A: Parallel FTP upload (`deploy.mjs`)

### Behavior

Replace the single serial upload loop with a **worker pool** of `N` independent `basic-ftp` connections. Reuse the existing `byDir` grouping (files bucketed by remote directory). A shared queue holds the `[dir, files]` entries; each worker owns one connection and loops: pull the next directory → `ensureDir(absolute remoteDir)` → upload its files by basename → repeat until the queue is empty.

Directories are the unit of parallelism. Because every directory op uses an **absolute** `${remoteRoot}/${dir}` path and `ensureDir` resets to root for absolute paths, independent connections never corrupt each other's working directory — no shared mutable state, no races.

### Concurrency

- New env var `FTP_CONCURRENCY`, **default 4**, clamped to **1–8** (`Math.min(8, Math.max(1, n))`; non-numeric/absent → 4). `=1` reproduces today's exact serial behavior for debugging. The 1–8 clamp keeps well under the typical shared-host connection cap (~8).
- Documented in `.env.example` alongside the other FTP settings.

### Structure / units

- Extract a **pure** helper `planUploadBatches(toUpload)` (or reuse/extend the existing `byDir` construction) that returns the list of `{ dir, files }` work items. Pure → unit-testable in isolation, like the existing `diffSizes`.
- A `runPool(items, concurrency, worker)` helper that runs `worker(item)` across `concurrency` workers pulling from a shared index, returning when all items are done. Also pure w.r.t. FTP (worker is injected) → unit-testable with a fake worker that records ordering/coverage.
- The FTP-specific worker: `async (item, client) => { ensureDir; upload each file; increment shared counter }`.

### Error handling

- Fail-fast: any upload rejection propagates; the pool rejects; a `finally` closes **every** worker connection. Same "any failure fails the deploy" semantics as today (non-zero exit).
- Progress: a shared counter prints `[done/total] rel` as today; ordering interleaves across workers (acceptable).

### What stays serial (unchanged)

Config-shape pre-flight, the initial remote snapshot (`listRemote`), post-upload verification (`verifyUpload`), and prune run on a single connection. They are `LIST`-bound (one command per directory, not per file). The pool is created for the upload phase; verification/prune reuse a single client (a pooled one or a dedicated one) and all connections are closed at the end.

---

## Component B: Prune empty directories (`deploy.mjs`, under `--prune`)

### Behavior

After `--prune` removes stale files, remove directories that became empty as a result.

1. From the `stale` file list (already computed), derive the set of **ancestor directories** (each stale file's dir and all parents up to — but excluding — `remoteRoot`).
2. Sort **deepest-first** (longest path first) so a parent is attempted only after its children are gone.
3. For each, attempt `await client.removeEmptyDir(${remoteRoot}/${dir})`. FTP `RMD` **fails on a non-empty directory**, so a directory still holding a surviving build file or a PROTECTED file (`.htaccess`, `config.php`, …) is never removed. Catch and skip such failures (they are expected, not errors).
4. Report `Removed N empty director(y|ies)` and list the ones actually removed.

### Safety

- `removeEmptyDir` (RMD) is self-protecting — it cannot delete a directory with any content. This is the core safety property.
- Blast radius is limited to ancestors of pruned files. Server infra like the `cgi-bin` symlink is never an ancestor of a pruned file and, even if it were attempted, RMD on a non-empty/symlink entry fails harmlessly.
- `remoteRoot` itself is excluded from the candidate set and never removed.

### Dry-run

Under `--dry-run`, predict which directories would become empty — a directory is predicted-empty if **every** remote file under its prefix is in `stale` — and list them under the existing dry-run plan output. Nothing is removed. Because real removal uses RMD (self-protecting), any imperfect prediction is harmless.

### Structure

- Extract a **pure** helper `emptyDirsAfterPrune(staleRelPaths, remoteRelFiles)` returning the deepest-first list of directory rel-paths that would be empty after the stale files are gone. Unit-testable; used both for the dry-run prediction and to order the real removal attempts.

---

## Component C: Persistent Composer cache (`build.mjs`)

### Behavior

The repo is already bind-mounted into the Composer containers at `/app` (`-v ${mount}:/app`). Point Composer's cache at a repo-local directory inside that mount by adding `-e COMPOSER_CACHE_DIR=/app/.composer-cache` to **each** of the three Docker `composer` invocations (old-app `install`, old-app `dump-autoload`, api `install`).

- Downloaded packages persist on the host across builds, so rebuilds don't re-download (fast) and don't re-expose the transient "corrupted zip (0 bytes)" download flakiness.
- No second volume mount needed — the cache lives under the already-mounted repo root.

### Housekeeping

- Add `.composer-cache/` to `.gitignore`.
- The cache dir sits at the repo root, outside `app/`, so it is never copied into `dist/build` and never uploaded. `rmrf('dist/build')` does not touch it.

---

## Data Flow (deploy, after changes)

```
parseArgs → load .env.<target> → connect (1 client)
  → config-shape pre-flight (serial)
  → listRemote snapshot (serial)
  → compute new/changed/unchanged/stale (pure)
  → [upload] worker pool of N clients over byDir batches   ← Component A
  → [verify] single client, listRemote + diffSizes (serial)
  → [prune, if --prune] remove stale files, then removeEmptyDir ancestors deepest-first  ← Component B
  → close all clients
```

## Testing

- **Unit (pure helpers), runnable locally** via the existing Node test path:
  - `planUploadBatches` / `byDir` grouping — correct bucketing, PROTECTED excluded (already are, upstream).
  - `runPool` — with a fake async worker: every item processed exactly once, respects the concurrency cap, rejects if a worker throws.
  - `emptyDirsAfterPrune` — dirs all-stale → listed deepest-first; dirs with a survivor → excluded; nested empties ordered child-before-parent; `remoteRoot` excluded.
  - `FTP_CONCURRENCY` parsing/clamp — absent→4, "0"→1, "99"→8, "abc"→4.
- **Live verification (local Docker/FTP or a real `deploy:test`):**
  - Parallel upload lands all files; existing post-upload byte-size verification passes.
  - `--prune --dry-run` lists predicted empty dirs; `--prune` removes stale files and then the emptied dirs, leaving PROTECTED files and their dirs intact.
  - `npm run build` twice: second run reuses the Composer cache (no re-download).

## Rollout / risk

- All changes are client-side tooling; no server component, no protocol change, no new deploy secret. CI picks up the speedup automatically (may optionally set `FTP_CONCURRENCY`).
- `FTP_CONCURRENCY=1` is a documented escape hatch to the old serial behavior if the host misbehaves under parallel connections.
- CLAUDE.md's deploy section gets a short note on `FTP_CONCURRENCY`, empty-dir pruning, and the Composer cache.
