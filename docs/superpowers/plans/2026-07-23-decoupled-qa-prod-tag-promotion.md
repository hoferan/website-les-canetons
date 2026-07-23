# Decoupled QA/PROD Tag Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split QA and PROD out of `ci.yml`'s chained, approval-gated deploy pipeline into two independent `workflow_dispatch` workflows, promoted by lightweight git tags instead of Required-reviewers approvals or CI-run-history lookups.

**Architecture:** `ci.yml` keeps its existing `deploy-test` auto-deploy on merge to `main`, unchanged. Three new/changed pieces sit alongside it: a `tag-release.yml` workflow that stamps a commit with a `YYYY-MM-DD-<short-sha>` tag; a `deploy-qa.yml` workflow that rebuilds and FTP-deploys whatever tag/branch you pick from GitHub's native ref selector; and a `deploy-prod.yml` workflow that does the same but first checks, via the GitHub Deployments API, that the exact commit it's about to deploy was already successfully deployed to `qa` — refusing to proceed otherwise.

**Tech Stack:** GitHub Actions (`workflow_dispatch`, Environments, Deployments API via `gh api`), existing `tools/deploy.mjs`/`npm run deploy:<env>` machinery (unchanged), bash, `jq` (preinstalled on `ubuntu-latest` runners).

## Global Constraints

- PHP version in every `setup-php` step: `"8.4"` (matches the rest of `ci.yml`).
- Node version in every `setup-node` step: `"20"` (matches the rest of `ci.yml`).
- Action versions: `actions/checkout@v5`, `actions/setup-node@v5`, `shivammathur/setup-php@v2` — match what `ci.yml` already uses elsewhere; do not introduce different versions.
- Tag format: `YYYY-MM-DD-<short-sha>`, e.g. `2026-07-23-a1b2c3d` — UTC date, 7-character short SHA. Exact, no variations.
- No new secrets anywhere in this plan — reuse the existing `FTP_HOST`/`FTP_USER`/`FTP_PASS`/`FTP_DIR` secrets already scoped per GitHub Environment (`qa`, `prod`).
- Least-privilege permissions: every workflow keeps the top-level `permissions: contents: read` default. `contents: write` is added only on `tag-release.yml`'s single job. `deployments: read` is added only on `deploy-prod.yml`'s single job. No other job in any workflow gets elevated permissions.
- No artifact upload/download between jobs anywhere — every deploy rebuilds from a checked-out ref via `npm run build` (inside `npm run deploy:<env>`).
- QA/PROD workflows are triggered only via GitHub's native `workflow_dispatch` "Run workflow from" branch/tag selector — never a custom free-text `ref` input. This is what keeps `GITHUB_SHA`/`GITHUB_REF_NAME` automatically correct with no override step.
- No changes to `tools/deploy.mjs`, `npm run dbmigrate:<env>`, or any PHP/JS application code — this plan touches only `.github/workflows/*.yml` and documentation.

---

### Task 1: Remove `deploy-qa`/`deploy-prod` from `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a `ci.yml` whose only deploy job is `deploy-test`, for Tasks 2–7 to build alongside.

- [ ] **Step 1: Make the edit**

In `.github/workflows/ci.yml`, replace this block (the end of the `deploy-test` job through the end of the file — i.e. everything after `deploy-test`'s FTP-deploy step):

```yaml
      - name: Deploy to TEST over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_DIR: ${{ secrets.FTP_DIR }}
        run: npm run deploy:test

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
      - uses: actions/checkout@v5
      # Guard against out-of-order gate approvals. If main has advanced past this
      # run's commit (a newer merge is queued behind it), approving this older run
      # now would silently regress the environment to the stale commit. Refuse
      # unless this run's commit is still the tip of main. Only needs the tip SHA,
      # so it's shallow-clone-safe (no fetch depth required).
      - name: Refuse stale commit
        run: |
          git fetch --quiet origin main
          tip=$(git rev-parse origin/main)
          if [ "$tip" != "$GITHUB_SHA" ]; then
            echo "::error::main has advanced to $tip but this run targets $GITHUB_SHA — refusing to deploy a stale commit. Approve the newer run instead."
            exit 1
          fi
          echo "Confirmed $GITHUB_SHA is the current tip of main."
      - uses: actions/setup-node@v5
        with:
          node-version: "20"
      - uses: shivammathur/setup-php@v2
        with:
          php-version: "8.4"
      - name: Install Node dev tools
        run: npm ci
      - name: Deploy to QA over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_DIR: ${{ secrets.FTP_DIR }}
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
      - uses: actions/checkout@v5
      # Guard against out-of-order gate approvals. If main has advanced past this
      # run's commit (a newer merge is queued behind it), approving this older run
      # now would silently regress the environment to the stale commit. Refuse
      # unless this run's commit is still the tip of main. Only needs the tip SHA,
      # so it's shallow-clone-safe (no fetch depth required).
      - name: Refuse stale commit
        run: |
          git fetch --quiet origin main
          tip=$(git rev-parse origin/main)
          if [ "$tip" != "$GITHUB_SHA" ]; then
            echo "::error::main has advanced to $tip but this run targets $GITHUB_SHA — refusing to deploy a stale commit. Approve the newer run instead."
            exit 1
          fi
          echo "Confirmed $GITHUB_SHA is the current tip of main."
      - uses: actions/setup-node@v5
        with:
          node-version: "20"
      - uses: shivammathur/setup-php@v2
        with:
          php-version: "8.4"
      - name: Install Node dev tools
        run: npm ci
      - name: Deploy to PROD over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_DIR: ${{ secrets.FTP_DIR }}
        run: npm run deploy:prod
```

with just:

```yaml
      - name: Deploy to TEST over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_DIR: ${{ secrets.FTP_DIR }}
        run: npm run deploy:test
```

(i.e. the file now ends right after `deploy-test`'s last step — no trailing jobs.)

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Confirm only the intended lines changed**

Run: `git diff --stat .github/workflows/ci.yml`
Expected: shows deletions only (no additions) — confirms `deploy-test` and every job before it are untouched.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: remove chained deploy-qa/deploy-prod jobs from ci.yml"
```

---

### Task 2: Create `tag-release.yml`

**Files:**
- Create: `.github/workflows/tag-release.yml`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a git tag named `YYYY-MM-DD-<short-sha>` on `origin`, which Tasks 3 and 4's manual verification steps will select from the native ref picker.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Tag Release

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  tag:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v5

      - name: Compute tag name
        id: tagname
        run: |
          short_sha=$(git rev-parse --short=7 HEAD)
          date=$(date -u +%Y-%m-%d)
          echo "name=${date}-${short_sha}" >> "$GITHUB_OUTPUT"

      - name: Check if tag already exists
        id: check
        run: |
          if git ls-remote --tags origin "refs/tags/${{ steps.tagname.outputs.name }}" | grep -q .; then
            echo "exists=true" >> "$GITHUB_OUTPUT"
          else
            echo "exists=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Create and push tag
        if: steps.check.outputs.exists == 'false'
        run: |
          git tag "${{ steps.tagname.outputs.name }}"
          git push origin "${{ steps.tagname.outputs.name }}"

      - name: Summary
        run: |
          if [ "${{ steps.check.outputs.exists }}" = "true" ]; then
            echo "Tag \`${{ steps.tagname.outputs.name }}\` already exists — nothing to do." >> "$GITHUB_STEP_SUMMARY"
          else
            echo "Created tag \`${{ steps.tagname.outputs.name }}\`." >> "$GITHUB_STEP_SUMMARY"
          fi
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/tag-release.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tag-release.yml
git commit -m "ci: add tag-release workflow for tagging QA/PROD promotion candidates"
```

- [ ] **Step 4: Push the branch so the workflow exists remotely for manual dispatch**

```bash
git push -u origin HEAD
```

- [ ] **Step 5: Manually dispatch it and verify**

Using the GitHub Actions UI (or `gh workflow run "Tag Release" --ref <this-branch>`, or the available GitHub MCP tool for triggering a workflow run), dispatch `Tag Release` from this branch. Expected: the run succeeds, its summary shows `Created tag `YYYY-MM-DD-<short-sha>``, and `git fetch --tags && git tag -l` locally shows the new tag after a `git fetch`.

- [ ] **Step 6: Verify idempotency**

Dispatch `Tag Release` again from the same commit, same day. Expected: the run succeeds, its summary shows `Tag `YYYY-MM-DD-<short-sha>` already exists — nothing to do.` (the exact same tag name as Step 5), and no duplicate tag or error occurs.

---

### Task 3: Create `deploy-qa.yml`

**Files:**
- Create: `.github/workflows/deploy-qa.yml`

**Interfaces:**
- Consumes: a tag created by Task 2's `tag-release.yml` (selected via the native ref picker when dispatching).
- Produces: a live deployment on the QA server, and a corresponding GitHub Deployment record for the `qa` environment that Task 4's `deploy-prod.yml` will query.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Deploy QA

on:
  workflow_dispatch:
    inputs:
      prune:
        description: "Pass --prune to delete stale remote files the build no longer produces"
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  deploy-qa:
    runs-on: ubuntu-latest
    environment: qa
    concurrency:
      group: deploy-qa
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: "20"

      - uses: shivammathur/setup-php@v2
        with:
          php-version: "8.4"

      - name: Install Node dev tools
        run: npm ci

      - name: Deploy to QA over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_DIR: ${{ secrets.FTP_DIR }}
        run: npm run deploy:qa -- ${{ inputs.prune && '--prune' || '' }}

      - name: Summary
        run: echo "Deployed tag \`${GITHUB_REF_NAME}\` (\`${GITHUB_SHA}\`) to QA." >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-qa.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-qa.yml
git commit -m "ci: add deploy-qa workflow, decoupled from the auto-deploy pipeline"
```

- [ ] **Step 4: Push**

```bash
git push
```

- [ ] **Step 5: Manually dispatch it against the tag from Task 2, and verify**

Using the GitHub Actions UI (or `gh workflow run "Deploy QA" --ref <the tag from Task 2>`, or the available GitHub MCP tool), dispatch `Deploy QA` selecting that tag from the ref picker, leaving `prune` at its default (`false`). Expected: the run succeeds; its summary shows `Deployed tag `<tag>` (`<sha>`) to QA.`; `/deployment.json` on the QA server shows `"ref": "<the tag name>"` and `"commit": "<the full sha>"` matching the tag's commit. Also open the repo's **Environments** page (or **Deployments** list) on GitHub and confirm the `qa` environment's latest deployment shows that same tag as its ref — this was flagged in the spec as needing empirical confirmation rather than assumed, so check it now rather than skipping it.

- [ ] **Step 6: Verify the `prune` input reaches `deploy.mjs`**

Dispatch `Deploy QA` again from the same tag with `prune: true`. Expected: the run succeeds (this is a real, low-stakes staging deploy — `deploy.mjs`'s own path guard and its prune logic have existing coverage from prior specs, so this step only confirms the boolean input threads through correctly, not `deploy.mjs`'s internals).

---

### Task 4: Create `deploy-prod.yml`

**Files:**
- Create: `.github/workflows/deploy-prod.yml`

**Interfaces:**
- Consumes: the GitHub Deployments API for the `qa` environment (populated by Task 3's real QA deploy) via `gh api`; a tag selected via the native ref picker.
- Produces: a live deployment on the PROD server, gated on QA's last successful deployment matching.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Deploy PROD

on:
  workflow_dispatch:
    inputs:
      prune:
        description: "Pass --prune to delete stale remote files the build no longer produces"
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: prod
    concurrency:
      group: deploy-prod
      cancel-in-progress: false
    permissions:
      contents: read
      deployments: read
    steps:
      - uses: actions/checkout@v5

      - name: Verify this commit was deployed to QA
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          repo="${{ github.repository }}"

          deployment=$(gh api "repos/${repo}/deployments?environment=qa&per_page=100" \
            --jq 'sort_by(.created_at) | reverse | .[0]')

          if [ -z "$deployment" ] || [ "$deployment" = "null" ]; then
            echo "::error::No deployments found for the qa environment — deploy this ref to QA first."
            exit 1
          fi

          deployment_id=$(echo "$deployment" | jq -r '.id')
          qa_sha=$(echo "$deployment" | jq -r '.sha')
          qa_ref=$(echo "$deployment" | jq -r '.ref')

          latest_status=$(gh api "repos/${repo}/deployments/${deployment_id}/statuses?per_page=100" \
            --jq 'sort_by(.created_at) | reverse | .[0].state // empty')

          if [ "$latest_status" != "success" ]; then
            echo "::error::QA's most recent deployment (tag ${qa_ref}, commit ${qa_sha}) has status '${latest_status:-unknown}', not success — refusing to deploy to PROD."
            exit 1
          fi

          if [ "$qa_sha" != "$GITHUB_SHA" ]; then
            echo "::error::This ref (${GITHUB_REF_NAME}, commit ${GITHUB_SHA}) does not match QA's last successful deployment (tag ${qa_ref}, commit ${qa_sha}). Deploy this ref to QA first."
            exit 1
          fi

          echo "Confirmed: ${GITHUB_REF_NAME} (${GITHUB_SHA}) matches QA's last successful deployment (${qa_ref})."
          {
            echo "### PROD validation"
            echo "- Deploying tag: \`${GITHUB_REF_NAME}\` (\`${GITHUB_SHA}\`)"
            echo "- Matched QA deployment: \`${qa_ref}\` (\`${qa_sha}\`)"
          } >> "$GITHUB_STEP_SUMMARY"

      - uses: actions/setup-node@v5
        with:
          node-version: "20"

      - uses: shivammathur/setup-php@v2
        with:
          php-version: "8.4"

      - name: Install Node dev tools
        run: npm ci

      - name: Deploy to PROD over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_DIR: ${{ secrets.FTP_DIR }}
        run: npm run deploy:prod -- ${{ inputs.prune && '--prune' || '' }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-prod.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-prod.yml
git commit -m "ci: add deploy-prod workflow, gated on a matching successful QA deployment"
```

- [ ] **Step 4: Push**

```bash
git push
```

- [ ] **Step 5: Validate the fail-closed mismatch case without touching PROD**

Dispatch `Deploy PROD` (via the Actions UI, `gh workflow run`, or the GitHub MCP tool) selecting **`main`** (not the tag from Task 2/3) as the ref — this deliberately picks a commit that (almost certainly) does not match QA's last successful deployment's SHA. Expected: the `Verify this commit was deployed to QA` step fails with an `::error::` naming both SHAs (or "no deployments found", if `main`'s tip happens to equal QA's SHA, pick a different, definitely-mismatched ref instead), and the job stops before ever reaching the `Deploy to PROD over FTP` step.

- [ ] **Step 6: Validate the matching case reaches (but does not have to complete) the real deploy step**

Dispatch `Deploy PROD` again, this time selecting the **exact tag** that Task 3 successfully deployed to QA. Expected: the `Verify this commit was deployed to QA` step succeeds, printing "Confirmed: ... matches QA's last successful deployment" and populating the step summary with both the deploying tag and the matched QA tag. Whether to let this run proceed all the way through the real `Deploy to PROD over FTP` step (actually publishing to the live PROD site) is a judgment call for whoever is running this verification — confirming the validation step's own log output is enough to prove the logic works; actually deploying to PROD for the first time under this new pipeline is equally validation, so either outcome is acceptable here.

---

### Task 5: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing from other tasks (pure documentation).
- Produces: accurate project documentation for the next person/agent reading `CLAUDE.md`.

- [ ] **Step 1: Replace the "Deployment (one gated CI pipeline)" bullet**

Replace this exact bullet (currently lines 43–53 of `CLAUDE.md`):

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

with:

```markdown
- **Deployment (auto TEST, tag-promoted QA/PROD):** a merge to `main` auto-deploys
  the built `public/` to **TEST** via the `deploy-test` job in
  `.github/workflows/ci.yml`. **QA** and **PROD** are independent
  `workflow_dispatch` workflows (`deploy-qa.yml`, `deploy-prod.yml`) — no
  Required-reviewers approval gate; the deliberate act of dispatching one with a
  chosen ref *is* the gate. Promotions are identified by git tags named
  `YYYY-MM-DD-<short-sha>` (see `tag-release.yml`), created from whichever commit
  you've verified on TEST; dispatching `deploy-qa.yml`/`deploy-prod.yml` always
  uses GitHub's native branch/tag selector, never a free-text ref. `deploy-prod.yml`
  additionally checks, via the GitHub Deployments API, that its target commit was
  already successfully deployed to `qa` — refusing to proceed otherwise. Rolling
  back is simply redeploying an older tag; there is no separate rollback
  mechanism. Every upload still **excludes the three server-owned files**
  (`.htaccess`, `robots.txt`, `config.php`). Those per-env files are placed once
  per server: `npm run build:overlay` generates them into `dist/overlay/<env>/`;
  `config.php` is always set by hand per server. See `staging/README.md`.
```

- [ ] **Step 2: Replace the "CI auto-deploy to TEST" and "QA / PROD deploy" bullets**

Replace these two exact bullets (currently lines 104–116 of `CLAUDE.md`):

```markdown
- **CI auto-deploy to TEST:** the `deploy-test` job in `.github/workflows/ci.yml`
  runs `npm run deploy:test` on every merge to `main`, after all other jobs pass.
  Requires four secrets — `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_DIR` —
  set on the `test` GitHub Environment (Settings → Environments → `test`), where
  you can also add protection rules. Since that FTP account reaches every
  environment, the per-target path guard applies in CI and `--prune` is never
  used there.
- **QA / PROD deploy (manual gates in CI):** `deploy-qa` and `deploy-prod` are
  jobs in `ci.yml`, gated by Required reviewers on the `qa`/`prod` GitHub
  Environments — approve `deploy-qa` when TEST is green, then `deploy-prod` when
  QA is green, all within the same run. Each needs its own `FTP_DIR` secret
  (scoped to that Environment) plus the shared `FTP_HOST`/`USER`/`PASS`.
  Locally, `npm run deploy:qa` / `npm run deploy:prod` do the same over FTP.
```

with:

```markdown
- **CI auto-deploy to TEST:** the `deploy-test` job in `.github/workflows/ci.yml`
  runs `npm run deploy:test` on every merge to `main`, after all other jobs pass.
  Requires four secrets — `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_DIR` —
  set on the `test` GitHub Environment (Settings → Environments → `test`), where
  you can also add protection rules. Since that FTP account reaches every
  environment, the per-target path guard applies in CI and `--prune` is never
  used there.
- **Tagging a promotion candidate:** `tag-release.yml` is a no-input
  `workflow_dispatch` workflow — dispatch it from whatever commit you've
  verified on TEST (defaults to `main`) and it creates (or, if already present,
  leaves alone) a tag named `YYYY-MM-DD-<short-sha>`. Usable from the GitHub
  mobile app.
- **QA / PROD deploy (independent, tag-based):** `deploy-qa.yml` and
  `deploy-prod.yml` are separate `workflow_dispatch` workflows, each with an
  optional `prune` boolean input. Dispatch either by picking a tag (or branch)
  from GitHub's native ref selector — never a typed-in ref. `deploy-prod.yml`
  first checks the GitHub Deployments API for the `qa` environment's most recent
  successful deployment and refuses to proceed unless its commit matches the
  ref being deployed to PROD. Neither workflow has a Required-reviewers approval
  step. Each needs its own `FTP_DIR` secret (scoped to that Environment) plus
  the shared `FTP_HOST`/`USER`/`PASS`. Locally, `npm run deploy:qa` /
  `npm run deploy:prod` do the same over FTP. Rolling back is redeploying an
  older tag with either workflow — no dedicated rollback mechanism exists.
```

- [ ] **Step 3: Verify the edits**

Run: `grep -n "deploy-qa\|deploy-prod\|Required reviewers\|tag-release" CLAUDE.md`
Expected: no remaining mention of "Required reviewers" or of `deploy-qa`/`deploy-prod` as jobs chained in one run; `tag-release.yml` is mentioned.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe decoupled tag-based QA/PROD promotion in CLAUDE.md"
```

---

### Task 6: Update `staging/README.md`

**Files:**
- Modify: `staging/README.md`

**Interfaces:**
- Consumes: nothing from other tasks (pure documentation).
- Produces: accurate staging/deploy documentation matching Tasks 1–4's actual behavior.

- [ ] **Step 1: Replace the "Releasing (normal path — CI)" step**

Replace this exact list item (currently lines 46–56 of `staging/README.md`):

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

with:

```markdown
2. **Releasing (normal path — CI):** a merge to `main` auto-deploys to **TEST**.
   Once you've verified TEST, dispatch `Tag Release` (see "CI: decoupled
   tag-based promotion" below) to stamp that commit; then dispatch `Deploy QA`
   and, once you've verified QA, `Deploy PROD` — each picking the tag from
   GitHub's ref selector, no approval click needed. Each deploy writes a
   `deployment.json` marker to the site root recording the deployed commit.
   **Manual fallback:** `npm run deploy:test` / `deploy:qa` / `deploy:prod` do the
   same over FTP from your machine (creds from a git-ignored `.env`, see
   `.env.example`). Flags: `-- --dry-run` (preview new/changed/unchanged/stale —
   run before pruning), `-- --prune` (delete remote plain files the build no
   longer produces; dirs/symlinks and the server-owned files are always kept),
   `-- --force` (re-upload everything). WinSCP hand-copy remains available for
   recovery.
```

- [ ] **Step 2: Replace the "CI: gated deploy pipeline" section**

Replace this exact section (currently lines 147–167 of `staging/README.md`):

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
  own `FTP_DIR` secret (uniform name, scoped per Environment). The `deploy.mjs`
  path guard refuses any dir that does not match the env name, and `--prune` is
  never used in CI.
- A `deployment.json` at each site root (web-readable, e.g.
  `https://<prod-host>/deployment.json`) records the deployed commit, ref, time,
  and CI run URL.
```

with:

```markdown
## CI: decoupled tag-based promotion

`ci.yml` only auto-deploys TEST. QA and PROD are separate, manually-dispatched
workflows:

```
… checks … ─→ deploy-test        Tag Release ──┐
              (auto on main)                    ├─→ Deploy QA ─→ Deploy PROD
                                                 │   (manual)     (manual, checks QA)
                                    (manual, no inputs)
```

- **TEST** deploys automatically after all checks pass on a merge to `main`.
- **Tag Release** (`tag-release.yml`) is a no-input `workflow_dispatch` — dispatch
  it from the commit you've verified on TEST (defaults to `main`); it creates (or
  no-ops if one already exists) a tag named `YYYY-MM-DD-<short-sha>`.
- **Deploy QA** (`deploy-qa.yml`) and **Deploy PROD** (`deploy-prod.yml`) are
  independent `workflow_dispatch` workflows with an optional `prune` boolean
  input. Dispatch either by picking a tag from GitHub's native ref selector —
  never type a ref in by hand. No Required-reviewers approval gate on either —
  the deliberate act of dispatching with a chosen tag is the gate.
- **Deploy PROD** additionally queries the GitHub Deployments API for the `qa`
  environment's most recent successful deployment and refuses to proceed unless
  its commit matches the ref being deployed to PROD.
- **Rollback** is redeploying an older tag with `Deploy QA`/`Deploy PROD` — there
  is no separate rollback mechanism or run-history lookup.
- Each `qa`/`prod` Environment needs `FTP_HOST`, `FTP_USER`, `FTP_PASS` and its
  own `FTP_DIR` secret (uniform name, scoped per Environment). The `deploy.mjs`
  path guard refuses any dir that does not match the env name.
- A `deployment.json` at each site root (web-readable, e.g.
  `https://<prod-host>/deployment.json`) records the deployed commit, ref (the
  tag name, for QA/PROD), time, and CI run URL.
```

- [ ] **Step 3: Verify the edits**

Run: `grep -n "deploy-qa\|deploy-prod\|Required reviewers\|Tag Release" staging/README.md`
Expected: no remaining mention of "Required reviewers" or the old gated-pipeline diagram; "Tag Release" is mentioned.

- [ ] **Step 4: Commit**

```bash
git add staging/README.md
git commit -m "docs: describe decoupled tag-based QA/PROD promotion in staging/README.md"
```

---

### Task 7: Remove the Required-reviewers gate and do a final end-to-end check

**Files:**
- None (GitHub repo settings change + manual verification only).

**Interfaces:**
- Consumes: Tasks 1–6 fully merged/pushed.
- Produces: a working pipeline matching the spec exactly — no approval gate, tag-based promotion, fail-closed PROD validation.

- [ ] **Step 1: Remove Required-reviewers from the `qa` Environment**

In the repo's GitHub Settings → Environments → `qa` → Deployment protection rules, uncheck/remove the "Required reviewers" rule. Leave the environment's secrets (`FTP_HOST`/`FTP_USER`/`FTP_PASS`/`FTP_DIR`) untouched.

- [ ] **Step 2: Remove Required-reviewers from the `prod` Environment**

Same as Step 1, for the `prod` Environment.

- [ ] **Step 3: Confirm dispatching no longer pauses for approval**

Dispatch `Deploy QA` (any valid tag). Expected: the run starts and completes without ever showing a "Review deployments" pause — confirms the protection rule is actually gone (an easy step to forget, since the workflow itself has no code for this — it's purely a GitHub Settings state).

- [ ] **Step 4: Final end-to-end walkthrough**

Starting from a fresh commit on `main` (or the current tip): dispatch `Tag Release` → confirm a new tag appears → dispatch `Deploy QA` with that tag → confirm QA's `deployment.json` shows the tag → dispatch `Deploy PROD` with that same tag → confirm the `Verify this commit was deployed to QA` step matches and the deploy proceeds → confirm PROD's `deployment.json` shows the tag. This exercises every piece built in Tasks 1–6 together, exactly as a maintainer would use it day-to-day.

- [ ] **Step 5: No commit for this task** — it is settings + manual verification only. If any step surfaces a bug in Tasks 1–4's workflow files, fix it in the relevant task's file and commit that fix with a message describing the bug found during end-to-end verification.
