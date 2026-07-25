# Resilient parallel FTP deploy + `.sync-state.json` manifest — design

**Date:** 2026-07-24
**Scope:** `tools/deploy.mjs` (and its tests). No change to `build.mjs`, CI workflow
structure, or the migrate step. The one FTP account, the per-env path guard, the
config-shape pre-flight, and the deployment marker all stay.

## Problem

Deploys to the shared host (`easy-hebergement.net`) are unstable when run with a
pool of parallel FTP connections. Two failure modes seen in practice:

- `Timeout (control socket)` — an idle pooled connection crosses the host's FTP
  idle timeout while its peers are still busy, and the host drops it.
- `550 Data connection failed` — a passive-mode data channel fails mid-transfer
  under concurrency.

Either one aborts the whole deploy today, because no FTP operation is retried.

Separately, every deploy pays for a full recursive `LIST` of the remote tree
(~1,000 directories, one round-trip each on a single connection) just to decide
what changed — ~30 s of silence, and the single slowest part of a routine deploy,
even when nothing changed.

## Goals

1. **Robust under parallelism.** No single transient FTP failure aborts a deploy.
2. **Fast routine deploys.** Skip the full recursive `LIST` when we can.
3. **Resumable.** An aborted deploy can continue without redoing confirmed work.
4. **Quick state overview.** See what's deployed without walking the tree.
5. **Identical locally and in CI.** Pure Node, no new runtime deps, no native
   binaries, no local-only assumptions.

## Non-goals

- Replacing FTP with SFTP/rsync/lftp/rclone (native binaries break local↔CI
  parity — the whole reason the tooling is pure Node). Documented as an
  escalation path only if retries can't stabilize the host.
- A general-purpose sync library (none does parallel multi-connection FTP sync;
  the popular JS one, SamKirkland/FTP-Deploy, is deliberately single-connection).

## Part 1 — Resilience layer

One primitive every fallible FTP operation flows through:

```
withRetry(op, onRetry, { retries=3, baseDelayMs=300, maxDelayMs=5000, sleep, jitter })
```

- Runs `op()`. On failure, sleeps `min(maxDelayMs, baseDelayMs * 2**attempt)`
  plus jitter, then (from attempt 1 on) calls `onRetry(attempt)` **before**
  re-running `op()`. `onRetry` is the reconnect step; because it runs inside the
  retry loop, a failed *reconnect* is itself retried.
- `sleep` and `jitter` are injected (real `setTimeout` / random in prod; a no-op
  sleep and `() => 0` jitter in tests) so backoff behavior is unit-testable
  without real waiting.
- After `retries` exhausted, throws the last error.

Helpers:

- `openPool(size, accessOpts)` → array of `size` freshly-connected clients
  (closes any it opened if one connect fails). Used for the LIST pool and the
  upload pool.
- `reconnector(client, accessOpts, restoreDir?)` → an `onRetry` that closes and
  re-`access`es the client, and (for uploads) re-`ensureDir`s so the connection's
  working directory is restored before the retried operation.

Every network op routes through `withRetry`: directory `list`, `ensureDir`, file
`uploadFrom`, prune `remove`/`removeEmptyDir`, the config-shape `downloadTo`, and
manifest download/upload.

**Every bulk phase runs in parallel over one shared mechanism, `withPool`** — a
runner that spreads items across a fresh pool of up to `FTP_CONCURRENCY`
connections (each item pinned to one free connection). LIST, upload, verify, and
prune all use it, so they fan out identically over the same connection budget:

- **Prune files is parallel.** FTP has no recursive delete, and basic-ftp's
  `removeDir` deletes serially on a single connection — no help for one large
  stale subtree (e.g. `api/vendor/`, ~6,400 files). So the per-file `DELE`s are
  spread across the pool grouped by directory (same fan-out as uploads).
- **Empty-directory sweep is a separate serial post-step** (`sweepEmptyDirs`,
  after prune / on its own via `--sweep`). It uses the **actual directory list
  from the tree walk** — `traverseDirs` now returns `{ files, dirs }`, recording
  every directory it discovers **including empty ones** (a dir is recorded when
  seen as a directory entry, not only when it holds a file). So the sweep also
  catches directories a previous aborted run left empty — which a file-path-derived
  list would miss. It tries `RMD` on each dir **deepest-first** (`deepestFirst`):
  because a child is always attempted before its parent, an entire empty subtree
  collapses inside-out in one pass. A dir that still holds a surviving/PROTECTED
  file returns 550 and is skipped. Serial by design — cleanup, not the hot path.

Concurrency stays `FTP_CONCURRENCY` (default 6, clamp 1–8); retry+backoff absorbs
transient overload. Lowering it remains the documented lever for a host that is
systematically connection-limited.

## Part 2 — `.sync-state.json` manifest

A manifest at the remote root records what this tool has confirmed on the server.

```jsonc
{
  "version": 1,
  "environment": "test",
  "commit": "40f2f9b",
  "updatedAt": "2026-07-24T09:12:00Z",
  "status": "complete",          // or "in-progress"
  "files": {
    "index.php":               { "size": 1234, "hash": "<sha256>" },
    "assets/dist/main-abc.js": { "size": 5678, "hash": "<sha256>" }
  }
}
```

- Named `.sync-state.json` (dotfile; the front-controller catch-all + `.htaccess`
  don't serve it). Added to `PROTECTED`, so it's never uploaded as a normal file
  and never pruned.
- **Fingerprint = sha256 content hash (+ size).** Hashing the ~7,000 local files
  is ~1–2 s. The server never hashes — we trust the manifest we wrote. This lets
  us **delete the `alwaysUpload` list** (autoload glue, Vite `manifest.json`,
  `deployment.json`): a content change is a hash change, full stop.

### Two paths, split on the operation's risk

- **Fast path (default upload deploy):** download the one manifest, diff the local
  manifest against it by hash, upload changed files, rewrite the manifest. **No
  recursive LIST.**
- **Authoritative path (`--prune` or `--relist`):** do the full recursive LIST
  (the resilient parallel walk) because *deleting* must be based on the server's
  real contents. Change detection still uses hashes from the (downloaded)
  manifest; the LIST supplies existence + sizes (drift check) + the prune set.
  Then rewrite the manifest from the result.
- **Bootstrap (no manifest on server):** automatically use the authoritative
  path. With no prior hashes, every already-present file is treated as changed
  and re-uploaded (safe, correct, needs no `alwaysUpload`); the first manifest is
  written at the end. The current server (6,463 un-manifested old-Laravel files)
  is handled correctly: the first `--prune` LISTs, uploads, prunes them, and
  writes a clean manifest.

### Diff (pure, unit-tested)

- `classifyByManifest(localManifest, remoteManifest)` → `{ newFiles, changed,
  unchanged, stale }`:
  - new: local rel absent from `remote.files`
  - changed: present but `hash` differs
  - unchanged: `hash` equal
  - stale: `remote.files` rel absent from local
- `classifyByListAndManifest(localManifest, remoteSizes, remoteManifest|null)`:
  - new: rel not in `remoteSizes`
  - changed: no manifest hash for rel, OR hash differs, OR server size differs
    from local size (drift)
  - unchanged: manifest hash equals local hash AND server size equals local size
  - stale: `remoteSizes` rel absent from local and not `PROTECTED`

### Resume

`status` starts as `in-progress` (manifest written before uploads begin). As
files upload, in-memory entries are added and the manifest is **checkpointed**
(throttled: at most every ~1,000 files or ~60 s, whichever first) via `withRetry`.
On success it's finalized to `complete`. A resumed run downloads the checkpointed
manifest, so already-confirmed files diff as unchanged and are skipped; worst case
re-sends only the files uploaded since the last checkpoint. Uploads are
idempotent, so a resume is always safe.

### Verify

Fast path verifies by LISTing only the directories we uploaded into (bounded by
the change set), reusing the existing size-based `diffSizes`. The authoritative
path already holds a full LIST, so it verifies against the uploaded set directly.

## New CLI flags

- `--relist` — force the authoritative full LIST even without `--prune` (reconcile
  the manifest against the server's real contents).
- `--sweep` — standalone maintenance: connect, LIST the tree, remove empty
  directories inside-out, and exit. No upload, no manifest change, no build needed
  (like `--status`). Use it to mop up empty directories a previous aborted run left
  behind. (After a `--prune` the same sweep runs automatically as a post-step.)
- `--status` — download and print the manifest header (env, commit, file count,
  updatedAt, complete/in-progress) and exit. No tree walk, no upload.

Existing `--dry-run` / `--prune` / `--force` / `--no-verify` keep their meaning.
`--dry-run` reports the chosen path and the plan without changing anything.

**npm scripts** (so nothing is run as a bare `node tools/...`): `deploy:<env>`
and `deploy:<env>:prune` build first (real deploys); `dryrun:<env>` builds then
previews; `status:<env>` and `sweep:<env>` are build-free remote-only maintenance.
`--force` / `--relist` are appended to a deploy script (`npm run deploy:test --
--force`).

## Testing

- Unit (pure, `node --test tools/deploy.test.mjs`): `withRetry` (success,
  retry-then-succeed, exhaustion, exponential backoff, cap, reconnect-failure
  retried), `traverseDirs`, `classifyByManifest`, `classifyByListAndManifest`,
  `parseConcurrency`, `runPool`, `emptyDirsAfterPrune`, `diffSizes`.
- Integration (manual, against TEST): bootstrap `--prune` (LIST + upload + prune
  old `api/` tree + write manifest), then a routine deploy (fast manifest path,
  no LIST), then `--status`.

## CI parity

`deploy.mjs` runs under Node identically locally and in the `deploy-test` job.
Injected `sleep` defaults to `setTimeout`. No native binary, no new dependency
(`node:crypto` for hashing is built in). CI still never uses `--prune`.
