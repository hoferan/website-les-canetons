# Post-deploy file-completeness verification

**Date:** 2026-07-19
**Status:** Approved (design)

## Problem

`tools/deploy.mjs` uploads the built `public/` artifact to a staging/prod server
over **plain FTP**, sending only new/changed files. FTP transfer is **not
atomic** and can drop mid-stream, leaving a file truncated or missing on the
server. Today nothing confirms, after the upload loop finishes, that what landed
on the server actually matches what we built — a partial upload can leave an
environment silently broken, and the deploy still reports success (exit 0).

The maintainer wants a check at the end of a deploy that confirms the deployment
succeeded, so a failed/partial upload is caught loudly instead of trusted.

## Goals

1. After a real deploy's uploads finish, confirm every file we uploaded is
   present on the server with a **byte size matching the local build**.
2. On any missing/mismatched file, **fail loudly**: print exactly what failed
   and exit non-zero (in CI, the deploy job goes red).
3. Add no new FTP capability requirement and no new `.env`/config surface.
4. Keep the verifier a small, well-bounded, unit-testable unit.

## Non-goals

- **No content hashing.** Byte-level corruption (right size, wrong bytes) is
  explicitly out of scope; a size check fully covers the truncation/partial-write
  failure mode we care about.
- **No HTTP / liveness check.** `/deployment.json` is not reachable via HTTP GET
  on these hosts, so an HTTP "is the new version served?" probe is not viable.
  (This is acceptable because Apache serves files straight from the docroot with
  no build cache or app-server restart, so "file present at correct size on the
  server" is very nearly equivalent to "new version served" here.)
- **No automatic remediation.** No retry, no rollback. The operator decides what
  to do after a red deploy. Backup/rollback remains a separate, future feature.
- **No re-verification of unchanged files.** Only the set uploaded this run is
  checked.

## Failure modes targeted

Chosen by the maintainer: **incomplete/truncated upload** and **site not serving
the new version** — the latter covered indirectly, per the non-goal note above,
because on this host a complete on-disk file is a served file. Explicitly *not*
targeted: silent byte corruption, broken app behavior (PHP 500s).

## Approach

Reuse the deploy's existing, trusted machinery. After the upload loop (and after
any `--prune`), take a fresh remote snapshot with the **same recursive
`listRemote(client, remoteRoot)`** the deploy already uses for size-based change
detection. This relies on `LIST` (known to return correct sizes on this host) and
deliberately avoids the FTP `SIZE` command, which some shared hosts disable.

A pure comparison function then judges the uploaded set against that snapshot.

### Components

- **`diffSizes(uploaded, remoteSizes)` — pure, exported (testable).**
  - `uploaded`: array of `{ rel, size }` — the files this run actually uploaded
    (new + changed, or everything under `--force`).
  - `remoteSizes`: `Map<rel, size>` — the post-upload remote snapshot.
  - Returns `{ ok, missing, mismatched }`:
    - `missing`: `rel[]` — uploaded but absent from the server afterward.
    - `mismatched`: `{ rel, local, remote }[]` — present but server size ≠ local.
    - `ok`: `missing.length === 0 && mismatched.length === 0`.
  - Ignores any remote file not in `uploaded` (unchanged files, server-owned
    files, infra) — only the uploaded set is judged.

- **`verifyUpload(client, remoteRoot, uploaded)` — thin FTP orchestrator.**
  Calls `listRemote` for the fresh snapshot, then `diffSizes`, and returns its
  result. Kept in `deploy.mjs` for cohesion (needs `listRemote` and the
  `toUpload` set); `diffSizes` is exported alongside `configKeyPaths` for unit
  testing, matching the pattern already established in this file.

### Control flow in `main()`

After the existing upload (and prune) steps, before the final
"deploy complete" line:

1. Skip verification and print a one-line note when any of:
   - `--dry-run` (already returns earlier — nothing uploaded),
   - `--no-verify` passed,
   - nothing was uploaded (remote already current).
2. Otherwise: `const result = await verifyUpload(client, remoteRoot, toUpload)`.
3. If `result.ok`: print `Verified N uploaded file(s) — server matches the build.`
4. If `!result.ok`: print the per-file report, then `throw new Error(...)`. The
   existing `main().catch` prints `Deploy failed: <msg>` and exits 1; the
   `finally` block still closes the FTP client.

### New flag

- `--no-verify` — bypass the post-deploy check. Parsed in `parseArgs()` next to
  `--dry-run` / `--prune` / `--force`.

## Example output

Success (appended after the upload summary):

```
Verifying 12 uploaded file(s) against the server...
Verified 12 uploaded file(s) — server matches the build.

TEST deploy complete.
```

Failure:

```
Verifying 12 uploaded file(s) against the server...
  MISMATCH assets/css/main.css (local 9.4 KB, remote 3.1 KB)
  MISSING  pages/accueil.php

Deploy failed: verification FAILED — 1 missing, 1 truncated. The upload completed
but the server copy doesn't match the build. Re-run the deploy (or investigate the
FTP connection) before trusting this environment.
```

## Testing

Unit tests for the pure `diffSizes`, run via the same standalone Node
scratch-harness style used to validate `configKeyPaths`:

1. All uploaded files match the snapshot → `ok: true`, empty lists.
2. One uploaded file absent from the snapshot → reported in `missing`.
3. One uploaded file with a differing server size → reported in `mismatched`
   with correct `local`/`remote` bytes.
4. Empty `uploaded` set → `ok: true` (no-op deploy).
5. A remote file *not* in `uploaded` is ignored (not flagged as missing/extra).

`verifyUpload`'s FTP orchestration is thin and exercised end-to-end by a real
deploy; the correctness logic lives entirely in the unit-tested `diffSizes`.

## Docs to update

- `CLAUDE.md` — note the post-deploy verification step and `--no-verify` in the
  deploy tooling description.
- `.env.example` — no change (no new config).
- Separately (not part of this feature): reconcile the `CLAUDE.md` /
  `staging/README.md` claim that `deployment.json` is "web-readable at
  `/deployment.json`" with the fact that it is not reachable via HTTP GET.

## Files touched

- `tools/deploy.mjs` — add `diffSizes` (exported) + `verifyUpload`; wire into
  `main()`; add `--no-verify` to `parseArgs()`.
- `CLAUDE.md` — document the verification step.
