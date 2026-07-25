# Deploy tool rewrite — modular FTP mirror with step UI — design

**Date:** 2026-07-25
**Scope:** Full rewrite of the FTP deploy tooling as a fresh `tools/deploy/`
package, replacing `tools/deploy.mjs` and `tools/deploy.test.mjs`. Also touches
`package.json` (script surface), `.github/workflows/_deploy.yml` +
`deploy-*.yml`/`ci.yml` inputs, `CLAUDE.md`, and `staging/README.md`.
`tools/build.mjs`, `tools/dotenv.mjs`, and the migrate step are unchanged.

**Supersedes:** `2026-07-24-resilient-parallel-deploy-sync-state-design.md`
(that design was implemented but never committed; this rewrite starts fresh and
harvests its proven pieces — see "Harvested code" below).

## Problem

The current deploy script works but has three shortcomings:

1. **Output UX.** It prints every file name (uploads, NEW/CHANGED/STALE lists),
   has no progress indication, and no visible plan — long deploys look hung and
   important lines scroll away.
2. **Stale files accumulate.** Deletion (`--prune`) is opt-in and treated as
   dangerous, so routine deploys leave stale files/dirs on the server.
3. **Architecture.** One 1,050-line file; `main()` interleaves printing,
   networking, and business logic, which makes a clean UI layer impossible to
   bolt on.

## Goals

1. **Simple usage.** One command per environment does the entire deploy
   (build → sync → verify); a build-free status command.
2. **True mirror by default.** Every deploy uploads new/changed files AND
   deletes stale files/folders (inside-out for folders), behind a safety brake.
3. **Fast + reliable.** Content-hash change detection via a server-side state
   file (no full remote LIST on routine deploys); every FTP op parallel over a
   pool and retried with backoff+reconnect; aborted deploys resumable.
4. **Chatty but not spammy.** A visible step plan with live progress bars;
   never a wall of file names (those go to `--verbose` / `--dry-run`); plain
   sequential logs in CI; no silent stretches.
5. **Runs everywhere identically.** Pure Node (no native binaries) — Windows
   dev machine, GitHub Actions, with or without Docker.

## Non-goals

- Wrapping an external sync binary (rclone/lftp): over FTP they degrade to
  size-only comparison (no checksums; this host's timestamps are unreliable),
  re-opening the "same size, changed content" blind spot, and they add a
  binary install on every platform. Documented escalation path only.
- Changing the build (`tools/build.mjs`), the migrate step, or the promotion
  flow (tags, QA-before-PROD validation).
- A separate rollback mechanism (rolling back stays "redeploy an older tag").

## Command surface

```
npm run deploy:test            # build + full sync to TEST (upload + delete stale + verify)
npm run deploy:qa
npm run deploy:prod
npm run status:test|qa|prod    # build-free: what's deployed? (commit, when, file count)

Flags (appended with --):
  --dry-run       build + compare, print the full plan (incl. file lists), change nothing
  --force         re-upload every file
  --force-delete  override the mass-delete safety brake
  --relist        reconcile: full remote LIST instead of trusting the state file
  --no-delete     this one deploy skips deletion (e.g. mid-incident hotfix)
  --verbose       stream per-file detail under the progress bars
```

- **The tool runs the build itself** as its first step (no `npm run build &&`
  chain in package.json), so the step list covers the entire deploy and no
  `dryrun:*` script family is needed. `status:*` skips the build.
- `deploy:*:prune`, `dryrun:*`, and `sweep:*` script families are removed:
  deletion + empty-dir sweep are part of every deploy.
- Direct invocation stays discouraged; npm scripts are the interface.
- Exit codes: `0` success, `1` failure, `2` refused by a guard or the brake
  (distinguishable in CI).

## Pipeline (each step visible in the UI)

1. **Build** → spawn the existing build; result: `dist/build/` (~7k files).
2. **Preflight** → env path guard (`FTP_DIR` must match the target env name —
   a mistyped dir can never deploy to or delete from the wrong environment),
   credentials present (`.env.<target>` then `.env`, env-specific wins),
   connect, config.php **shape** check (parse via php-parser, never evaluate;
   compare dotted key paths against `config/config.example.php`; refuse on
   drift, warn-only if config.php can't be fetched, report-only on
   `--dry-run`).
3. **Scan** → walk `dist/build/`, sha256-hash every file.
4. **Remote state** → download `.sync-state.json` (one small file). Full
   parallel remote LIST only on bootstrap (no state file) or `--relist`.
5. **Plan** → diff by content hash → N new, M changed, K unchanged, D stale,
   E empty dirs. Then the **safety brake**: if the deletion count is **both
   more than 50 files and more than 20% of the remote file count**, abort
   (exit 2) with the deletion list and require `--force-delete`. (Below 50
   deletions the brake never trips; a huge-but-proportionally-small cleanup
   trips it only past 20%.)
6. **Upload** → parallel over the pool; state checkpointed (throttled) so an
   aborted run resumes — a re-run re-sends only what didn't land.
7. **Delete stale** → parallel file deletes, then empty-dir sweep
   **deepest-first**: a child directory is always RMD'd before its parent
   (FTP can only delete empty dirs), so an empty subtree collapses inside-out
   in one pass; a dir still holding a file returns 550 and is skipped.
8. **Verify** → LIST only the directories touched this run; confirm every
   uploaded file landed at the right byte size; failure exits non-zero with
   the state file left in-progress (resume re-sends the shortfall).
9. **Finalize** → write `.sync-state.json` (status `complete`) +
   `deployment.json` marker (deployed commit/ref/time/run URL, web-readable;
   read by `status:*` and CI summaries).

### Deletion semantics

- Server-owned files are **never uploaded, never deleted**: `.htaccess`,
  `robots.txt`, `config.php`, `.htpasswd`, plus the tool-owned
  `.sync-state.json`.
- Routine deletion is **manifest-based**: the tool only deletes files it
  recorded as deployed in the state file. Deleting a file the manifest knows
  but the server already lost is a no-op (550 → treated as already gone).
  Hand-uploaded strays are untouched until a `--relist` reconciles the state
  file against the server's real contents — deletion can never be more
  aggressive than what the tool itself put there.
- `--relist` (and bootstrap) base existence on a real LIST, so reconciliation
  deletes are grounded in the server's actual tree.

### Sync engine details

- **Fingerprint:** sha256 content hash + size, computed locally (~1–2 s for
  ~7k files). The server never hashes; we trust the state file we wrote. No
  "same size, changed content" blind spot, no `alwaysUpload` exception list.
- **State file:** `.sync-state.json` at the remote root — `{version,
  environment, commit, updatedAt, status: complete|in-progress, files:
  {rel → {size, hash}}}`. Dotfile so the front controller/.htaccess don't
  serve it.
- **Concurrency:** `FTP_CONCURRENCY` (default 6, clamped 1–8; 1 = serial).
  All bulk phases — LIST, upload, delete, verify — fan out over one shared
  pool mechanism with identical connection lifecycle.
- **Resilience:** every FTP op runs through `withRetry` (exponential backoff
  + jitter, reconnect between attempts, reconnect failures themselves
  retried). This host drops idle control sockets and fails passive data
  channels under concurrency; a single transient failure must never abort a
  deploy.

## Terminal output

Three modes, picked automatically:

- **Interactive (TTY):** full step plan rendered up front; finished steps
  collapse to one `✓` line with counts + timing; the active step shows a live
  progress bar (in-place redraw, ≤10 fps) or a spinner + elapsed time for
  steps without a percentage. Long silent stretches are impossible by
  construction. Final one-line summary: uploaded / deleted / dirs removed /
  unchanged / duration.

```
DEPLOY test → ftp.example.net /test.example.ch @ 40f2f9b

 ✓ Build                dist/build: 6,912 files                    14.2s
 ✓ Preflight            guards OK · config shape OK                 1.1s
 ✓ Scan                 6,912 files hashed                          1.4s
 ✓ Remote state         .sync-state.json @ d825952 (6,901 files)    0.8s
 ✓ Plan                 38 new, 4 changed, 6,863 unchanged, 7 stale
 ▶ Upload               [=========>----------] 48% · 20/42 · 1.1 MB/s
 □ Delete stale         7 files, 2 empty dirs
 □ Verify
 □ Finalize

TEST deploy done in 48s — 42 uploaded, 7 deleted, 2 dirs removed, 6,863 unchanged.
```

- **CI / non-TTY:** the same steps as plain sequential lines (start line +
  finish line with counts/timing), a heartbeat at most every 10 s inside long
  steps, no ANSI redraws. The final summary line stays grep-able for the
  workflow summary.
- **`--verbose` / `--dry-run`:** per-file lines under the step (`+` added,
  `~` changed, `-` deleted). Dry-run always prints the full plan lists, with
  the summary counts repeated at the end.

Errors mark the step `✗` in place and print the error **with what to do
next** (brake tripped → "check the list, re-run with `--force-delete`";
verify failed → "re-run the deploy; resume re-sends only the shortfall").
Secrets (config values, passwords) never appear in any output.

## Architecture

```
tools/deploy/
  cli.mjs        entry: arg parsing, .env loading, orchestration (the only "main")
  ui.mjs         step engine: TTY renderer / CI logger behind one interface (only module that prints)
  ftp.mjs        pool, withRetry, parallel tree walk (only module that does FTP I/O)
  sync.mjs       pure: classify (hash diff), brake decision, deepestFirst, verify diff
  preflight.mjs  env guard, protected set, config-shape check (php-parser, never evaluated)
  state.mjs      .sync-state.json schema, download/checkpoint/finalize
```

Rules:

- `sync.mjs` is 100% pure (no I/O, no printing) → fully unit-testable.
- `ui.mjs` consumes step/progress events; it never holds business logic.
- `cli.mjs` is the only place modules are wired together.
- Only `ftp.mjs` talks to the network; only `ui.mjs` writes to the terminal.

**Harvested code:** the proven, already-unit-tested pieces of the uncommitted
overhaul — `withRetry`, the pool runner, the work-stealing tree walk, the
classify functions, `deepestFirst`, `parseConcurrency`, the config-shape
parser — move into the new modules **with their tests**, adapted to the new
boundaries. Fresh architecture, not fresh bugs. `tools/deploy.mjs` and
`tools/deploy.test.mjs` are then deleted.

## Testing

- **Unit** (`node --test tools/deploy/`, wired into `npm run test:js`, runs in
  CI): retry/backoff with injected sleep/jitter (success, retry-then-succeed,
  exhaustion, cap, failed-reconnect retried); classify + brake edge cases
  (empty build, bootstrap, protected files, threshold boundaries); deepest-
  first ordering; verify diff; state-file round-trip; UI renderer smoke tests
  against a fake stream (TTY and non-TTY).
- **Integration** (manual, against TEST): bootstrap (no state file → LIST +
  full upload + state write), routine deploy (fast path, no LIST), abort +
  resume, `--relist`, brake trip + `--force-delete`.

## CI changes

- `_deploy.yml` keeps `dry_run` and `force` inputs; the `prune` input is
  removed (mirroring is the default; the brake + path guard make that safe in
  CI too). `deploy-test.yml` / `deploy-qa.yml` / `deploy-prod.yml` and the
  `ci.yml` auto-TEST job keep calling the same npm scripts.
- Workflow summaries parse the tool's final summary line (stable format).
- Exit code 2 (guard/brake refusal) surfaces as a distinct failure message in
  the job summary.

## Documentation updates

`CLAUDE.md` (deployment sections) and `staging/README.md` are rewritten to the
new surface; `.env.example` comments checked for accuracy (`FTP_CONCURRENCY`
default 6 stays).
