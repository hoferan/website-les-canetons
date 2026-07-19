# Post-deploy File-Completeness Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a real deploy's uploads finish, confirm every uploaded file is present on the server with a byte size matching the local build, and fail the deploy (exit non-zero) if any file is missing or truncated.

**Architecture:** Add two functions to `tools/deploy.mjs`: a pure, exported `diffSizes(uploaded, remoteSizes)` that reports missing/mismatched files, and a thin async `verifyUpload(client, remoteRoot, uploaded)` that takes a fresh remote snapshot via the existing `listRemote` and delegates to `diffSizes`. Wire it into `main()` after the upload/prune steps, gated by a new `--no-verify` flag and skipped when nothing was uploaded.

**Tech Stack:** Node.js (ESM, `type: module`), `basic-ftp`. No new dependencies. Validation via a throwaway Node scratch-harness (matching how `configKeyPaths` was validated — the repo has no committed JS test runner).

## Global Constraints

- Node ESM only (`type: "module"`); use `import`, top-level `await` allowed in scripts. — verbatim from package.json.
- **No new npm dependencies** and **no new `.env`/config** for this feature. — from spec Non-goals/Goals.
- **Reuse `listRemote(client, remoteRoot)`** for the remote snapshot; rely on `LIST` sizes, **never the FTP `SIZE` command** (some hosts disable it). — from spec Approach.
- **Only the uploaded set** is verified (new + changed, or everything under `--force`); unchanged files are not re-checked. — from spec Non-goals.
- **No hashing, no HTTP, no retry, no rollback.** — from spec Non-goals.
- Everything in English (code, comments, identifiers). — from CLAUDE.md.
- Conventional Commits for commit messages (`type(scope): description`). — from CLAUDE.md.
- End every commit message with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **Modify `tools/deploy.mjs`:**
  - Add pure `diffSizes(uploaded, remoteSizes)` near the other helpers (after `listRemote`).
  - Add async `verifyUpload(client, remoteRoot, uploaded)` next to it.
  - Add `NO_VERIFY` to the object returned by `parseArgs()`.
  - Wire verification into `main()` after the prune block, before the final "deploy complete" line.
  - Export `diffSizes` alongside the existing `configKeyPaths` export.
- **Modify `CLAUDE.md`:** document the post-deploy verification step and `--no-verify` in the deploy tooling description.
- **Throwaway (never committed):** a scratch harness file to TDD `diffSizes`; deleted before the commit step.

---

### Task 1: Pure `diffSizes` comparison function

**Files:**
- Modify: `tools/deploy.mjs` (add `diffSizes`, add to the `export {}` line)
- Test: throwaway `verify-diffsizes.check.mjs` at the repo root (created, run, deleted — not committed)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `diffSizes(uploaded, remoteSizes)` — pure, exported.
    - `uploaded`: `Array<{ rel: string, size: number }>` — files uploaded this run.
    - `remoteSizes`: `Map<string, number>` — remote path → byte size (as returned by `listRemote`).
    - Returns `{ ok: boolean, missing: string[], mismatched: Array<{ rel: string, local: number, remote: number }> }`.
    - `missing`: uploaded `rel` absent from `remoteSizes`. `mismatched`: present but `remoteSizes.get(rel) !== size`. `ok`: both empty. Remote entries not in `uploaded` are ignored.

- [ ] **Step 1: Write the failing test**

Create `verify-diffsizes.check.mjs` at the repo root:

```javascript
import { pathToFileURL } from 'node:url';
const { diffSizes } = await import(pathToFileURL('tools/deploy.mjs').href);

let pass = 0;
let fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log(`ok   ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`);
  }
}

// 1. All uploaded files present at matching sizes -> ok.
eq(
  'all match',
  diffSizes(
    [
      { rel: 'a.css', size: 100 },
      { rel: 'sub/b.php', size: 200 },
    ],
    new Map([
      ['a.css', 100],
      ['sub/b.php', 200],
    ])
  ),
  { ok: true, missing: [], mismatched: [] }
);

// 2. An uploaded file absent from the snapshot -> missing.
eq(
  'missing file',
  diffSizes([{ rel: 'a.css', size: 100 }], new Map()),
  { ok: false, missing: ['a.css'], mismatched: [] }
);

// 3. Present but wrong size -> mismatched with local/remote bytes.
eq(
  'size mismatch',
  diffSizes([{ rel: 'a.css', size: 100 }], new Map([['a.css', 40]])),
  { ok: false, missing: [], mismatched: [{ rel: 'a.css', local: 100, remote: 40 }] }
);

// 4. Empty uploaded set -> ok (no-op deploy).
eq('empty upload', diffSizes([], new Map([['a.css', 100]])), { ok: true, missing: [], mismatched: [] });

// 5. Remote file not in the uploaded set is ignored.
eq(
  'ignores untouched remote files',
  diffSizes([{ rel: 'a.css', size: 100 }], new Map([['a.css', 100], ['unrelated.txt', 5]])),
  { ok: true, missing: [], mismatched: [] }
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node verify-diffsizes.check.mjs`
Expected: FAIL — throws `TypeError: diffSizes is not a function` (it isn't exported yet).

- [ ] **Step 3: Write the minimal implementation**

In `tools/deploy.mjs`, add this immediately after the `listRemote` function (it ends around the `return acc; }` near line 128):

```javascript
// Compare the files uploaded this run against a fresh remote snapshot. Pure so
// it is unit-testable in isolation. `uploaded` is [{rel, size}]; `remoteSizes`
// is the Map<rel, size> from listRemote. Reports files that did not land
// (missing) or landed at the wrong byte count (mismatched = truncated/partial).
// Remote files not in `uploaded` are ignored — only this run's uploads are judged.
function diffSizes(uploaded, remoteSizes) {
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
```

Then update the export line at the very bottom of the file:

```javascript
export { configKeyPaths, diffSizes };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node verify-diffsizes.check.mjs`
Expected: PASS — `5 passed, 0 failed`.

- [ ] **Step 5: Delete the throwaway harness and commit**

```bash
rm verify-diffsizes.check.mjs
git add tools/deploy.mjs
git commit -m "feat(deploy): add diffSizes helper for upload verification

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire verification into the deploy, add `--no-verify`, document it

**Files:**
- Modify: `tools/deploy.mjs` (`parseArgs`, add `verifyUpload`, wire into `main()`)
- Modify: `CLAUDE.md` (document the step)

**Interfaces:**
- Consumes: `diffSizes(uploaded, remoteSizes)` from Task 1; `listRemote(client, remoteRoot)` and `humanBytes(n)` already in `deploy.mjs`; `toUpload` (the `[...newFiles, ...changed]` array of `{rel, size}`) already built in `main()`.
- Produces:
  - `verifyUpload(client, remoteRoot, uploaded)` — async; returns the same shape as `diffSizes`.
  - `parseArgs()` return object gains `NO_VERIFY: boolean`.

- [ ] **Step 1: Add `--no-verify` to `parseArgs()`**

In `tools/deploy.mjs`, in the object returned by `parseArgs()` (currently returns `target, DRY_RUN, PRUNE, FORCE, dirVar, guard, LABEL`), add the `NO_VERIFY` field:

```javascript
  return {
    target,
    DRY_RUN: args.includes('--dry-run'),
    PRUNE: args.includes('--prune'),
    FORCE: args.includes('--force'),
    NO_VERIFY: args.includes('--no-verify'),
    dirVar,
    guard,
    LABEL: target.toUpperCase(),
  };
```

Also update the usage string in `parseArgs()` to include the new flag:

```javascript
    console.error(`Usage: node tools/deploy.mjs <${Object.keys(TARGETS).join('|')}> [--dry-run] [--prune] [--force] [--no-verify]`);
```

- [ ] **Step 2: Add the `verifyUpload` orchestrator**

In `tools/deploy.mjs`, immediately after the `diffSizes` function from Task 1, add:

```javascript
// Take a fresh remote snapshot (reusing listRemote — same LIST-based sizes the
// deploy already trusts, so no reliance on the FTP SIZE command) and compare the
// files we just uploaded against it.
async function verifyUpload(client, remoteRoot, uploaded) {
  const remoteSizes = await listRemote(client, remoteRoot);
  return diffSizes(uploaded, remoteSizes);
}
```

- [ ] **Step 3: Destructure `NO_VERIFY` in `main()`**

In `main()`, update the first line that destructures `parseArgs()`:

```javascript
  const { target, DRY_RUN, PRUNE, FORCE, NO_VERIFY, dirVar, guard, LABEL } = parseArgs();
```

- [ ] **Step 4: Wire verification into `main()` before the "deploy complete" line**

In `main()`, find the prune block followed by the final completion log:

```javascript
    if (PRUNE) {
      for (const rel of stale) {
        console.log(`  removing ${rel}`);
        await client.remove(`${remoteRoot}/${rel}`);
      }
      console.log(`Pruned ${stale.length} file(s).`);
    }

    console.log(`\n${LABEL} deploy complete.`);
```

Insert the verification block between the prune block and the `console.log(\`\n${LABEL} deploy complete.\`)` line, so it reads:

```javascript
    if (PRUNE) {
      for (const rel of stale) {
        console.log(`  removing ${rel}`);
        await client.remove(`${remoteRoot}/${rel}`);
      }
      console.log(`Pruned ${stale.length} file(s).`);
    }

    // Post-deploy verification: confirm every file we uploaded landed on the
    // server at the right byte size. Skipped when bypassed or when nothing was
    // uploaded. A failure throws — caught by main().catch, which exits non-zero.
    if (NO_VERIFY) {
      console.log('\nSkipping post-deploy verification (--no-verify).');
    } else if (toUpload.length === 0) {
      console.log('\nNothing uploaded — skipping post-deploy verification.');
    } else {
      console.log(`\nVerifying ${toUpload.length} uploaded file(s) against the server...`);
      const result = await verifyUpload(client, remoteRoot, toUpload);
      if (result.ok) {
        console.log(`Verified ${toUpload.length} uploaded file(s) — server matches the build.`);
      } else {
        result.mismatched.forEach((m) =>
          console.log(`  MISMATCH ${m.rel} (local ${humanBytes(m.local)}, remote ${humanBytes(m.remote)})`)
        );
        result.missing.forEach((rel) => console.log(`  MISSING  ${rel}`));
        throw new Error(
          `verification FAILED — ${result.missing.length} missing, ${result.mismatched.length} truncated. ` +
            `The upload completed but the server copy doesn't match the build. Re-run the deploy ` +
            `(or investigate the FTP connection) before trusting this environment.`
        );
      }
    }

    console.log(`\n${LABEL} deploy complete.`);
```

- [ ] **Step 5: Verify the module still parses and imports cleanly**

Run: `node --check tools/deploy.mjs && node -e "import('./tools/deploy.mjs').then(m => console.log('exports:', Object.keys(m)))"`
Expected: no syntax error, and prints `exports: [ 'configKeyPaths', 'diffSizes' ]` (importing does not run `main()` because of the entry guard).

- [ ] **Step 6: Verify `--dry-run` skips verification (no regression)**

Run: `npm run deploy:test -- --dry-run 2>&1 | tail -5`
Expected: ends with `(dry-run) No changes made.` and shows **no** "Verifying ... uploaded file(s)" line (dry-run returns before the upload/verify path). If `.env` FTP creds are absent, the dry-run instead prints the missing-credentials notice and the local file list — also acceptable; the key assertion is that no verification line appears and the command does not error on the new code.

- [ ] **Step 7: Document the step in `CLAUDE.md`**

In `CLAUDE.md`, in the bullet describing `npm run deploy:test` (the one listing the `-- --dry-run`, `-- --prune`, `-- --force` flags), add a sentence documenting verification and the new flag. Locate this text:

```
  `-- --force` (re-upload every file, for the rare edit that
  keeps a file's size identical).
```

Change it to:

```
  `-- --force` (re-upload every file, for the rare edit that
  keeps a file's size identical). After a real upload it **verifies** every
  uploaded file is present on the server at the matching byte size (reusing the
  same LIST-based size check) and exits non-zero if any file is missing or
  truncated; `-- --no-verify` skips that check.
```

- [ ] **Step 8: Commit**

```bash
git add tools/deploy.mjs CLAUDE.md
git commit -m "feat(deploy): verify uploaded files match the server after deploy

Reuses listRemote for a post-upload snapshot and compares byte sizes for the
uploaded set; missing/truncated files fail the deploy (exit non-zero). Add a
--no-verify escape hatch. Skipped on --dry-run and when nothing was uploaded.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Goal 1 (verify uploaded files match by size) → Task 1 (`diffSizes`) + Task 2 (`verifyUpload` + wiring). ✓
- Goal 2 (fail loudly, exit non-zero) → Task 2 Step 4 (throw → `main().catch` exits 1). ✓
- Goal 3 (no new FTP capability / config) → Global Constraints + `verifyUpload` reuses `listRemote`; no `.env` change. ✓
- Goal 4 (small, unit-testable unit) → `diffSizes` exported + tested in Task 1. ✓
- Scope = uploaded set only → `diffSizes` iterates `uploaded`, ignores other remote entries (Task 1 test 5). ✓
- Skip on `--dry-run` / nothing uploaded / `--no-verify` → Task 2 Step 4 conditionals + Step 6 check. ✓
- Example output (MISMATCH/MISSING lines, success line) → Task 2 Step 4 matches spec wording. ✓
- Docs update (CLAUDE.md) → Task 2 Step 7. ✓
- `.env.example` no change → confirmed (not touched). ✓
- The `deployment.json` HTTP-reachability doc reconciliation is a spec-declared *separate* follow-up → intentionally out of this plan. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". All steps show full code and exact commands. ✓

**3. Type consistency:** `diffSizes(uploaded, remoteSizes)` and its return shape `{ ok, missing, mismatched:[{rel, local, remote}] }` are identical in Task 1 (definition + tests), the Task 2 interface block, and the Task 2 Step 4 consumption (`result.ok`, `result.mismatched` with `.rel/.local/.remote`, `result.missing`). `verifyUpload` returns that same shape. `NO_VERIFY` added in `parseArgs()` (Step 1) and destructured in `main()` (Step 3). ✓
