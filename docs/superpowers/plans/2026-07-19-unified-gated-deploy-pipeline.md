# Unified, gated deploy pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate deploys into a single `ci.yml` pipeline where TEST deploys automatically on merge to `main` and QA then PROD are manual-approval gates in the same run, add full prod-over-FTP, a per-env deployment marker file, relabelled deploy badges, and PR-surfaced PHPUnit results.

**Architecture:** `deploy.mjs` gains a `prod` target and writes a `deployment.json` marker into `public/` before every upload. `ci.yml` grows two environment-gated jobs (`deploy-qa` → `deploy-prod`) chained after `deploy-test`; the manual gate is enforced by GitHub Environment "Required reviewers", so no `workflow_dispatch` is needed and `deploy-qa.yml` is deleted. The `tests` job additionally posts its existing summary as a sticky PR comment and a check-run. Docs are updated to match.

**Tech Stack:** GitHub Actions, Node ESM tooling (`basic-ftp`), PHPUnit (JUnit XML), shields.io GitHub-deployments badges.

## Global Constraints

- **English everywhere; French only for on-screen UI text.** All code, comments, identifiers, docs in English.
- **Never commit `app/config.php`, `public/`, or production data.** `public/` is generated; `deployment.json` lives inside it and is therefore never committed.
- **Server-owned files are never uploaded or pruned:** `.htaccess`, `robots.txt`, `config.php`, `.htpasswd` (existing `PROTECTED` set in `deploy.mjs`).
- **`deploy.mjs` path guard is mandatory** — each target refuses to run unless its `FTP_*_DIR` matches the env name, because the one FTP account can reach every environment.
- **`--prune` is never used in CI** — destructive deletes stay local/manual.
- **No JS test framework exists in this repo** (only PHPUnit for PHP). JS changes are verified by *running the script and observing output*, not by unit tests — this is the established pattern for `tools/*.mjs`.
- **Conventional Commits** for every commit (`type(scope): description`).

---

## File Structure

- `tools/deploy.mjs` — **modify.** Add `prod` target; write + force-upload `deployment.json`.
- `package.json` — **modify.** Add `deploy:prod` script.
- `.github/workflows/ci.yml` — **modify.** Add gated `deploy-qa` + `deploy-prod` jobs; add PR reporting to `tests` job.
- `.github/workflows/deploy-qa.yml` — **delete.** Superseded by the in-pipeline gated job.
- `README.md` — **modify.** Top-row `TEST`/`QA`/`PROD` badges; deploy description.
- `CLAUDE.md` — **modify.** Deploy bullets; drop "prod = manual WinSCP".
- `staging/README.md` — **modify.** Unified gated flow; marker file; prod row.
- `.env.example` — **modify.** Add `FTP_PROD_DIR`.

---

## Task 1: `deploy.mjs` prod target + deployment marker

**Files:**
- Modify: `tools/deploy.mjs`
- Modify: `package.json:11-12`

**Interfaces:**
- Produces: `npm run deploy:prod` (builds + `node tools/deploy.mjs prod`); a `prod` entry in `TARGETS` with `dirVar: 'FTP_PROD_DIR'` and guard `/(^|[/.])prod([/.]|$)/i`; a `public/deployment.json` written on every deploy with keys `environment, commit, shortCommit, ref, deployedAt, runUrl`, force-uploaded via an `ALWAYS_UPLOAD` set.

- [ ] **Step 1: Add imports for marker generation**

In `tools/deploy.mjs`, replace the fs import line:

```js
import { existsSync, readdirSync, statSync } from 'node:fs';
```

with:

```js
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
```

- [ ] **Step 2: Update the header comment (prod is no longer manual)**

Replace lines 10-17 (the usage block + the "test/qa only" note):

```js
//   npm run deploy:test               # upload new/changed files to TEST
//   npm run deploy:qa                 # upload new/changed files to QA
//   node tools/deploy.mjs <target> -- --dry-run  # show the plan, change nothing
//   node tools/deploy.mjs <target> -- --prune    # also delete remote files not in public/
//   node tools/deploy.mjs <target> -- --force    # re-upload every file, even unchanged ones
//
// Credentials come from a git-ignored .env (see .env.example). test/qa only, on
// purpose — prod stays a manual promotion.
```

with:

```js
//   npm run deploy:test               # upload new/changed files to TEST
//   npm run deploy:qa                 # upload new/changed files to QA
//   npm run deploy:prod               # upload new/changed files to PROD
//   node tools/deploy.mjs <target> -- --dry-run  # show the plan, change nothing
//   node tools/deploy.mjs <target> -- --prune    # also delete remote files not in public/
//   node tools/deploy.mjs <target> -- --force    # re-upload every file, even unchanged ones
//
// Credentials come from a git-ignored .env (see .env.example). The one FTP
// account can reach every environment, so each target hard-refuses to run unless
// its FTP_*_DIR matches the env name (see the guards below). Each deploy also
// writes a deployment.json marker into public/ recording the deployed commit.
```

- [ ] **Step 3: Add the marker constants and the `prod` target**

Replace the `PROTECTED` definition line:

```js
// Files that live on the server and must never be uploaded or pruned.
const PROTECTED = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd']);
```

with:

```js
// Files that live on the server and must never be uploaded or pruned.
const PROTECTED = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd']);

// The deployment marker. Written into public/ on every deploy and always
// re-uploaded (a commit SHA is a fixed length, so the size-based change check
// below would otherwise treat it as "unchanged" and skip it forever).
const MARKER = 'deployment.json';
const ALWAYS_UPLOAD = new Set([MARKER]);
```

Then add the `prod` target to `TARGETS`:

```js
const TARGETS = {
  test: { dirVar: 'FTP_TEST_DIR', guard: /(^|[/.])test([/.]|$)/i },
  qa: { dirVar: 'FTP_QA_DIR', guard: /(^|[/.])qa([/.]|$)/i },
};
```

becomes:

```js
const TARGETS = {
  test: { dirVar: 'FTP_TEST_DIR', guard: /(^|[/.])test([/.]|$)/i },
  qa: { dirVar: 'FTP_QA_DIR', guard: /(^|[/.])qa([/.]|$)/i },
  prod: { dirVar: 'FTP_PROD_DIR', guard: /(^|[/.])prod([/.]|$)/i },
};
```

- [ ] **Step 4: Add the marker-writing function**

Immediately after the `walk(...)` function definition (after its closing `}` around line 59), add:

```js
// Write a deployment marker into public/ so each server's root records exactly
// which commit is deployed there. Values come from GitHub Actions env vars when
// running in CI, falling back to local git for hand-runs.
function writeDeploymentMarker(env) {
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
  const marker = { environment: env, commit, shortCommit, ref, deployedAt: new Date().toISOString(), runUrl };
  writeFileSync(path.join(LOCAL_ROOT, MARKER), `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
}
```

- [ ] **Step 5: Write the marker before walking the tree**

Replace:

```js
  loadDotEnv();
  const local = walk(LOCAL_ROOT).sort((a, b) => a.rel.localeCompare(b.rel));
```

with:

```js
  loadDotEnv();
  const marker = writeDeploymentMarker(target);
  const local = walk(LOCAL_ROOT).sort((a, b) => a.rel.localeCompare(b.rel));
  console.log(`  marker: ${MARKER} @ ${marker.shortCommit} (${marker.deployedAt})`);
```

- [ ] **Step 6: Force-upload the marker in the change classification**

Replace:

```js
      } else if (FORCE || remoteSize !== f.size) {
        changed.push({ ...f, remoteSize });
```

with:

```js
      } else if (FORCE || ALWAYS_UPLOAD.has(f.rel) || remoteSize !== f.size) {
        changed.push({ ...f, remoteSize });
```

- [ ] **Step 7: Add the `deploy:prod` npm script**

In `package.json`, after the `deploy:qa` line:

```json
    "deploy:qa": "npm run build && node tools/deploy.mjs qa",
```

add:

```json
    "deploy:prod": "npm run build && node tools/deploy.mjs prod",
```

- [ ] **Step 8: Build the artifact so verification has a `public/` to work on**

Run: `npm run build`
Expected: exits 0; `public/index.php` and `public/vendor/` exist.

- [ ] **Step 9: Verify the prod path guard refuses a mismatched dir**

Run:
```bash
FTP_HOST=x FTP_USER=x FTP_PASS=x FTP_PROD_DIR=/some/staging/qa node tools/deploy.mjs prod
```
Expected: exits non-zero with `Refusing to run: FTP_PROD_DIR="/some/staging/qa" does not look like the PROD target.`

- [ ] **Step 10: Verify the marker is written and the file list includes it**

Run (no FTP creds, so it takes the dry-run listing branch):
```bash
env -u FTP_HOST -u FTP_USER -u FTP_PASS -u FTP_PROD_DIR node tools/deploy.mjs prod -- --dry-run
```
Expected: prints `marker: deployment.json @ <shortsha> (<iso timestamp>)` and lists local files including `deployment.json`.

Then confirm the marker content:
```bash
cat public/deployment.json
```
Expected: valid JSON with `"environment": "prod"`, a `commit`, a 7-char `shortCommit`, a `ref`, a `deployedAt` ISO timestamp, and `"runUrl": null` (local run).

- [ ] **Step 11: Run the JS/format checks**

Run: `npm run lint:js && npm run format:check`
Expected: PASS (if Prettier flags `deploy.mjs`, run `npm run format:write` and re-check).

- [ ] **Step 12: Commit**

```bash
git add tools/deploy.mjs package.json
git commit -m "feat(deploy): add prod FTP target and deployment.json marker"
```

---

## Task 2: Gated `deploy-qa` + `deploy-prod` jobs in `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml` (append two jobs after `deploy-test`)
- Delete: `.github/workflows/deploy-qa.yml`

**Interfaces:**
- Consumes: `deploy-test` job (Task's `needs`); `npm run deploy:qa` / `npm run deploy:prod` (Task 1).
- Produces: `deploy-qa` (needs `deploy-test`, `environment: qa`) and `deploy-prod` (needs `deploy-qa`, `environment: prod`), both push-to-main gated, each with its own concurrency group. The `qa`/`prod` GitHub Environments' Required-reviewers rule is what pauses the run for manual approval.

- [ ] **Step 1: Append the two gated jobs**

At the end of `.github/workflows/ci.yml` (after the `deploy-test` job's last line, `run: npm run deploy:test`), add:

```yaml

  # Promote the SAME run's artifact to QA. The manual gate is the `qa` GitHub
  # Environment's Required-reviewers rule (Settings → Environments → qa) — the
  # run pauses here until a maintainer approves. Same commit as deploy-test, so
  # no "resolve latest green commit" step is needed.
  deploy-qa:
    runs-on: ubuntu-latest
    needs: [deploy-test]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: qa
    concurrency:
      group: deploy-qa
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install Node dev tools
        run: npm ci
      - name: Deploy to QA over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_QA_DIR: ${{ secrets.FTP_QA_DIR }}
        run: npm run deploy:qa

  # Promote the same artifact to PROD, gated by the `prod` GitHub Environment's
  # Required-reviewers rule. Only reachable after QA has been approved + deployed.
  deploy-prod:
    runs-on: ubuntu-latest
    needs: [deploy-qa]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: prod
    concurrency:
      group: deploy-prod
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install Node dev tools
        run: npm ci
      - name: Deploy to PROD over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_PROD_DIR: ${{ secrets.FTP_PROD_DIR }}
        run: npm run deploy:prod
```

- [ ] **Step 2: Delete the standalone QA workflow**

Run: `git rm .github/workflows/deploy-qa.yml`
Expected: file staged for deletion.

- [ ] **Step 3: Verify the workflow YAML is valid**

Run: `npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo OK`
Expected: prints `OK` (valid YAML). If offline, instead re-read the file and confirm indentation matches the existing jobs; the authoritative check is the CI run on the branch (Step 5).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(deploy): add gated deploy-qa and deploy-prod jobs to ci.yml"
```

- [ ] **Step 5: Confirm the graph after push (post-merge observation)**

After this branch's PR runs, confirm on the Actions run page that `deploy-qa`/`deploy-prod` are skipped on the PR (they require `push` to `main`). After merge, confirm the run reaches `deploy-qa` and shows "Review deployments" (requires Required reviewers set on the `qa`/`prod` environments — see Prerequisites at the end of this plan).

---

## Task 3: Surface PHPUnit results on PRs (sticky comment + check-run)

**Files:**
- Modify: `.github/workflows/ci.yml` (the `tests` job)

**Interfaces:**
- Consumes: existing `junit.xml` (produced by the PHPUnit step) and `tools/phpunit-summary.mjs` (unchanged).
- Produces: a sticky PR comment (header `phpunit`) and a `PHPUnit` check-run with inline failure annotations; a job-scoped `permissions` block granting `checks: write` + `pull-requests: write`.

- [ ] **Step 1: Grant the `tests` job the permissions the reporters need**

In `.github/workflows/ci.yml`, replace the `tests` job opening:

```yaml
  tests:
    runs-on: ubuntu-latest
    services:
```

with (job-level permissions keep least-privilege for every other job intact):

```yaml
  tests:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
      pull-requests: write
    services:
```

- [ ] **Step 2: Capture the summary to a file and add the two reporters**

Replace the existing final step of the `tests` job:

```yaml
      - name: Test result summary
        if: always()
        run: node tools/phpunit-summary.mjs junit.xml >> "$GITHUB_STEP_SUMMARY"
```

with:

```yaml
      - name: Test result summary
        if: always()
        run: node tools/phpunit-summary.mjs junit.xml | tee test-summary.md >> "$GITHUB_STEP_SUMMARY"
      - name: Comment test summary on PR
        if: always() && github.event_name == 'pull_request'
        continue-on-error: true
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: phpunit
          path: test-summary.md
      - name: Publish PHPUnit check
        if: always()
        continue-on-error: true
        uses: mikepenz/action-junit-report@v5
        with:
          report_paths: junit.xml
          check_name: PHPUnit
          detailed_summary: true
          include_passed: false
```

(`continue-on-error: true` keeps reporting failures — e.g. a fork PR where `GITHUB_TOKEN` is read-only — from turning the build red.)

- [ ] **Step 3: Verify the workflow YAML is valid**

Run: `npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo OK`
Expected: prints `OK`. If offline, re-read the `tests` job and confirm indentation; the real proof is the reporters appearing on this branch's PR (Step 5).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(tests): post PHPUnit summary as sticky PR comment and check-run"
```

- [ ] **Step 5: Confirm on this branch's PR (observation)**

After opening/pushing the PR, confirm a single `## ✅ PHPUnit results` comment appears (and updates in place on re-push, not duplicating) and a `PHPUnit` check is listed.

---

## Task 4: README badges + deploy description

**Files:**
- Modify: `README.md:3-4`, `README.md:18-20`, `README.md:86-98`

**Interfaces:**
- Consumes: the deployment records created by the `environment:` jobs (Task 2) that the shields badges read.

- [ ] **Step 1: Replace the deploy badge with three env badges**

Replace `README.md` line 4:

```markdown
[![Deploy TEST](https://img.shields.io/github/deployments/hoferan/website-les-canetons/test?label=deploy%20test)](https://github.com/hoferan/website-les-canetons/deployments)
```

with:

```markdown
[![TEST](https://img.shields.io/github/deployments/hoferan/website-les-canetons/test?label=TEST)](https://github.com/hoferan/website-les-canetons/deployments)
[![QA](https://img.shields.io/github/deployments/hoferan/website-les-canetons/qa?label=QA)](https://github.com/hoferan/website-les-canetons/deployments)
[![PROD](https://img.shields.io/github/deployments/hoferan/website-les-canetons/prod?label=PROD)](https://github.com/hoferan/website-les-canetons/deployments)
```

- [ ] **Step 2: Update the tech-stack deploy sentence**

Replace:

```markdown
- Hosted on `easy-hebergement.net` shared hosting. `npm run build` assembles the
  deploy artifact into `public/`; merges to `main` auto-deploy it to **TEST**
  via CI, and qa/prod are manual promotions of the same tested bytes.
```

with:

```markdown
- Hosted on `easy-hebergement.net` shared hosting. `npm run build` assembles the
  deploy artifact into `public/`; merges to `main` auto-deploy it to **TEST**
  via CI, then **QA** and **PROD** are manual-approval gates in the same CI run
  (GitHub Environment reviewers) that promote the exact same tested commit.
```

- [ ] **Step 3: Rewrite the Deployment section**

Replace the whole `## Deployment` section (lines 86-98, from the heading through the paragraph ending `…not a production config source.`) with:

```markdown
## Deployment

Deploys run entirely in CI as one pipeline (`.github/workflows/ci.yml`):

```
php,tests,assets,guard,build ─→ deploy-test ─→ deploy-qa ─→ deploy-prod
                                 (auto)         (gated)       (gated)
```

- **TEST** deploys automatically on every merge to `main`, once all checks pass.
- **QA** and **PROD** are manual gates: the run pauses at each until a maintainer
  approves it (GitHub → the run → "Review deployments"). Because it is one run on
  one commit, QA and PROD receive the exact bytes tested on TEST.
- Each deploy writes a `deployment.json` to the site root recording the deployed
  commit, ref, and time — e.g. `https://<prod-host>/deployment.json` — so you can
  always see what is live where. Per-env status is also on the badges above.

The server-owned files (`.htaccess`, `robots.txt`, `config.php`) are never
uploaded, so promotion never touches a server's config. For the full server
layout, the access-control overlay, and manual/WinSCP fallbacks, see
[staging/README.md](staging/README.md).

To build the artifact locally without deploying:

```bash
npm run build   # -> public/ (regenerated fresh; never edit by hand)
```
```

- [ ] **Step 4: Verify Prettier is happy with the Markdown**

Run: `npx --yes prettier --check README.md`
Expected: `All matched files use Prettier code style!` (if it reports issues, run `npx --yes prettier --write README.md`).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): TEST/QA/PROD badges and gated deploy pipeline description"
```

---

## Task 5: Update CLAUDE.md deploy bullets

**Files:**
- Modify: `CLAUDE.md` (Tech Stack + Config bullets)

- [ ] **Step 1: Replace the "Deployment (promote one artifact)" bullet**

Find the bullet starting `- **Deployment (promote one artifact):**` and replace the entire bullet with:

```markdown
- **Deployment (one gated CI pipeline):** all deploys run in
  `.github/workflows/ci.yml`. A merge to `main` auto-deploys the built `public/`
  to **TEST**; **QA** then **PROD** are manual-approval gates in the *same run*
  (`deploy-qa` needs `deploy-test`, `deploy-prod` needs `deploy-qa`), enforced by
  **Required reviewers** on the `qa`/`prod` GitHub Environments. The run pauses at
  each gate until a maintainer approves. Because it is one run on one commit, QA
  and PROD get the exact bytes tested on TEST — no "resolve latest green commit"
  step. Every upload still **excludes the three server-owned files**
  (`.htaccess`, `robots.txt`, `config.php`). Those per-env files are placed once
  per server: `npm run build:overlay` generates them into `dist/overlay/<env>/`;
  `config.php` is always set by hand per server. See `staging/README.md`.
```

- [ ] **Step 2: Replace the "Automated TEST deploy" bullet's prod caveat**

In the bullet starting `- **Automated TEST deploy (optional):**`, replace the final sentence:

```markdown
  TEST only — qa/prod stay manual promotions.
```

with:

```markdown
  The same `deploy.mjs` also powers `deploy:qa` and `deploy:prod`; each target
  hard-refuses to run unless its `FTP_*_DIR` matches the env name, so a mistyped
  dir can never deploy to (or `--prune`!) the wrong environment.
```

- [ ] **Step 3: Replace the "CI auto-deploy to TEST" bullet's closing sentence**

In the bullet starting `- **CI auto-deploy to TEST:**`, replace:

```markdown
  Since that FTP account reaches prod too, the
  `test`-path guard above applies in CI and `--prune` is never used there. qa and
  prod remain manual promotions.
```

with:

```markdown
  Since that FTP account reaches every environment, the per-target path guard
  applies in CI and `--prune` is never used there.
```

- [ ] **Step 4: Replace the "QA deploy" bullet with a QA + PROD gate bullet**

Replace the entire bullet starting `- **QA deploy:**` with:

```markdown
- **QA / PROD deploy (manual gates in CI):** `deploy-qa` and `deploy-prod` are
  jobs in `ci.yml`, gated by Required reviewers on the `qa`/`prod` GitHub
  Environments — approve `deploy-qa` when TEST is green, then `deploy-prod` when
  QA is green, all within the same run. Each needs its env's `FTP_*_DIR` secret
  (`FTP_QA_DIR` / `FTP_PROD_DIR`) plus the shared `FTP_HOST`/`USER`/`PASS`.
  Locally, `npm run deploy:qa` / `npm run deploy:prod` do the same over FTP.
- **Deployment marker:** each deploy writes `deployment.json` to the site root
  (deployed commit, ref, time, run URL). It is force-uploaded every deploy (a SHA
  is a fixed length, so the size-based change check would otherwise skip it) and
  is web-readable at `/deployment.json`.
```

- [ ] **Step 5: Fix the Config bullet's promotion claim**

In the Config bullet (Architecture section), the sentence currently reads
`So the code artifact is safe to promote test → qa → prod unchanged.` — leave the
meaning but confirm it still reads correctly alongside the new FTP-based prod
(no edit needed if it already says the artifact promotes unchanged). If it
mentions WinSCP as the *only* prod path, replace that clause with
`the same artifact is promoted test → qa → prod by the gated CI jobs`.

- [ ] **Step 6: Verify no stale "manual WinSCP" prod claims remain**

Run: `grep -ni "winscp\|manual .*prod\|prod.*manual" CLAUDE.md`
Expected: any remaining hits describe WinSCP only as an optional fallback, not as the required prod path. Fix any that still say prod is manual-only.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): describe unified gated deploy pipeline and prod FTP"
```

---

## Task 6: Update `staging/README.md` and `.env.example`

**Files:**
- Modify: `staging/README.md`
- Modify: `.env.example`

- [ ] **Step 1: Add the PROD row to the environments table**

In `staging/README.md`, replace the table body rows:

```markdown
| `staging/test/`   | `<test-host>/`                          | https://<test-host>          | TEST — current `main` |
| `staging/qa/`     | `<qa-host>/`                           | https://<qa-host>            | QA                    |
```

with:

```markdown
| `staging/test/`   | `<test-host>/`                          | https://<test-host>          | TEST — current `main` |
| `staging/qa/`     | `<qa-host>/`                           | https://<qa-host>            | QA                    |
| `staging/prod/`   | `<prod-host>/`                          | https://<prod-host>          | PROD                  |
```

- [ ] **Step 2: Update the "Releasing" step to describe the CI pipeline**

Replace step 2 of the "Deployment: build once, promote one artifact" list:

```markdown
2. **Releasing:** upload `public/` to **TEST** — either by hand in WinSCP, or
   with `npm run deploy:test` (builds + FTP-uploads only new/changed files to
   TEST, with progress; creds from a git-ignored `.env`, see `.env.example`).
   Flags: `-- --dry-run` (preview new/changed/unchanged/stale — run before
   pruning), `-- --prune` (delete remote plain files the build no longer
   produces; dirs/symlinks and the server-owned files are always kept),
   `-- --force` (re-upload everything). Then in WinSCP copy the code
   **test → qa → prod** so the exact tested bytes reach prod.
```

with:

```markdown
2. **Releasing (normal path — CI):** a merge to `main` auto-deploys to **TEST**;
   then approve the **QA** and **PROD** gates in the same CI run (see
   "CI: gated deploy pipeline" below). Each deploy writes a `deployment.json`
   marker to the site root recording the deployed commit.
   **Manual fallback:** `npm run deploy:test` / `deploy:qa` / `deploy:prod` do the
   same over FTP from your machine (creds from a git-ignored `.env`, see
   `.env.example`). Flags: `-- --dry-run` (preview new/changed/unchanged/stale —
   run before pruning), `-- --prune` (delete remote plain files the build no
   longer produces; dirs/symlinks and the server-owned files are always kept),
   `-- --force` (re-upload everything). WinSCP hand-copy remains available for
   recovery.
```

- [ ] **Step 3: Replace the "CI: QA deploy (manual)" section**

Replace the entire final section (from `## CI: QA deploy (manual)` to the end of the file) with:

```markdown
## CI: gated deploy pipeline

Everything is one pipeline in `.github/workflows/ci.yml`:

```
… checks … ─→ deploy-test ─→ deploy-qa ─→ deploy-prod
              (auto on main)  (gated)       (gated)
```

- **TEST** deploys automatically after all checks pass on a merge to `main`.
- **QA** and **PROD** are jobs gated by **Required reviewers** on the `qa` and
  `prod` GitHub Environments (Settings → Environments → `qa` / `prod`). The run
  pauses at each; a maintainer clicks **Review deployments → Approve**. QA is
  reachable once TEST is done; PROD once QA is done.
- Each `qa`/`prod` Environment needs `FTP_HOST`, `FTP_USER`, `FTP_PASS` and its
  own `FTP_QA_DIR` / `FTP_PROD_DIR` secret. The `deploy.mjs` path guard refuses
  any dir that does not match the env name, and `--prune` is never used in CI.
- A `deployment.json` at each site root (web-readable, e.g.
  `https://<prod-host>/deployment.json`) records the deployed commit, ref, time,
  and CI run URL.
```

- [ ] **Step 4: Add `FTP_PROD_DIR` to `.env.example`**

In `.env.example`, replace the comment block lines 6-12:

```
# FTP_TEST_DIR / FTP_QA_DIR: the remote docroot for each staging site, relative
# to the FTP user's home (whatever your FTP client shows as the folder path).
# Each MUST contain its env name ("test" / "qa"): the deploy script refuses any
# other path, so this account — which can also reach prod — can never deploy to
# the wrong place.
#   FTP_TEST_DIR=/path/to/<test-host>
#   FTP_QA_DIR=/path/to/<qa-host>
```

with:

```
# FTP_TEST_DIR / FTP_QA_DIR / FTP_PROD_DIR: the remote docroot for each site,
# relative to the FTP user's home (whatever your FTP client shows as the folder
# path). Each MUST contain its env name ("test" / "qa" / "prod"): the deploy
# script refuses any other path, so this one account — which can reach every
# environment — can never deploy to the wrong place.
#   FTP_TEST_DIR=/path/to/<test-host>
#   FTP_QA_DIR=/path/to/<qa-host>
#   FTP_PROD_DIR=/path/to/<prod-host>
```

- [ ] **Step 5: Add the `FTP_PROD_DIR` value line**

Replace:

```
FTP_TEST_DIR=CHANGE_ME
FTP_QA_DIR=CHANGE_ME
```

with:

```
FTP_TEST_DIR=CHANGE_ME
FTP_QA_DIR=CHANGE_ME
FTP_PROD_DIR=CHANGE_ME
```

- [ ] **Step 6: Verify docs formatting**

Run: `npx --yes prettier --check "staging/README.md"`
Expected: passes (or run `--write` then re-check). `.env.example` is not Prettier-managed; just re-read it to confirm the block is correct.

- [ ] **Step 7: Commit**

```bash
git add staging/README.md .env.example
git commit -m "docs(staging): document gated CI pipeline, prod FTP, and deployment marker"
```

---

## Prerequisites (maintainer, outside the repo — not code steps)

These are required for the manual gates to actually work; verify before merging:

1. **Required reviewers enabled** on the `qa` and `prod` GitHub Environments
   (Settings → Environments → each → "Required reviewers", add yourself).
   Without this, the gated jobs run automatically with no pause.
2. **`FTP_PROD_DIR` secret** added to the `prod` Environment (the `prod`
   Environment must also carry `FTP_HOST`/`FTP_USER`/`FTP_PASS`, as `qa`/`test`
   already do).

---

## Self-Review notes (spec coverage)

- Spec §1 (unified gated pipeline) → Task 2. Spec §2 (prod FTP + script + secret)
  → Task 1 (+ Prerequisite 2). Spec §3 (deployment marker) → Task 1. Spec §4
  (top-row TEST/QA/PROD badges) → Task 4. Spec §4a (PR test reporting) → Task 3.
  Spec §5 (docs: README/CLAUDE/staging/.env.example) → Tasks 4, 5, 6. Spec
  Prerequisites → the Prerequisites section above.
- `deploy-qa.yml` deletion (spec §1) → Task 2, Step 2.
