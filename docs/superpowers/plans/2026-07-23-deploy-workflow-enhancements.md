# Deploy Workflow Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Deploy TEST` workflow, expose `dry_run`/`force` inputs alongside the existing `prune` on all three deploy workflows, extract their shared logic into one reusable `workflow_call` workflow, enhance their summaries, and add an optional custom tag-name input to `tag-release.yml`.

**Architecture:** A new `.github/workflows/_deploy.yml` (`workflow_call`-only) holds the actual checkout/setup/deploy/summary logic once, parameterized by `environment` and three boolean inputs. `deploy-test.yml` (new) and `deploy-qa.yml` (rewritten) become thin wrappers that just declare `workflow_dispatch` inputs and call it. `deploy-prod.yml` splits into a `validate-qa` job (unchanged bash logic, now standalone) and a `deploy` job (the same thin-wrapper call, gated by `needs: [validate-qa]`). `tag-release.yml` gains an optional `tag_name` input with collision handling.

**Tech Stack:** GitHub Actions (`workflow_call` reusable workflows, `workflow_dispatch`, `secrets: inherit`), bash, existing `tools/deploy.mjs`/`package.json` `deploy:<env>` scripts (unchanged).

## Global Constraints

- Action versions: `actions/checkout@v5`, `actions/setup-node@v5` (node `"20"`), `shivammathur/setup-php@v2` (php `"8.4"`) — match what's already used throughout `.github/workflows/`.
- No new secrets — every workflow reuses the existing `FTP_HOST`/`FTP_USER`/`FTP_PASS`/`FTP_DIR` secrets, scoped per GitHub Environment (`test`/`qa`/`prod`) exactly as today.
- `--no-verify` is deliberately NOT exposed as a workflow input anywhere in this plan.
- `tools/deploy.mjs` itself is not modified anywhere in this plan — only how CI invokes it and presents its output changes.
- `deploy-prod.yml`'s QA-validation bash logic (querying the Deployments API, failing closed) is reused byte-for-byte — only its packaging (its own job, not an inline step) changes.
- The reusable workflow is called only via `uses: ./.github/workflows/_deploy.yml` with `secrets: inherit` — never with explicit `secrets:` mappings.
- Tag format for auto-generated names stays `YYYY-MM-DD-<short-sha>` (UTC date, 7-character short SHA) — unchanged from the existing `tag-release.yml`.
- No format validation is added for a custom `tag_name` beyond what `git tag` itself already enforces.

---

### Task 1: Create the reusable deploy workflow

**Files:**
- Create: `.github/workflows/_deploy.yml`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a `workflow_call` workflow taking inputs `environment` (string, required), `dry_run`/`prune`/`force` (booleans, default `false` each) — Tasks 2-4 call this.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Deploy (reusable)

on:
  workflow_call:
    inputs:
      environment:
        description: "Which environment to deploy to (test, qa, or prod)"
        type: string
        required: true
      dry_run:
        type: boolean
        default: false
      prune:
        type: boolean
        default: false
      force:
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    concurrency:
      group: deploy-${{ inputs.environment }}
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

      - name: Deploy over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_DIR: ${{ secrets.FTP_DIR }}
        run: |
          set -o pipefail
          npm run deploy:${{ inputs.environment }} -- \
            ${{ inputs.dry_run && '--dry-run' || '' }} \
            ${{ inputs.prune && '--prune' || '' }} \
            ${{ inputs.force && '--force' || '' }} \
            2>&1 | tee deploy-output.log

      - name: Summary
        if: always()
        run: |
          {
            echo "### Deploy to ${{ inputs.environment }}"
            echo "- Ref: \`${GITHUB_REF_NAME}\` (\`${GITHUB_SHA}\`)"
            echo "- Flags: dry-run=${{ inputs.dry_run }}, prune=${{ inputs.prune }}, force=${{ inputs.force }}"
            if [ -f deploy-output.log ]; then
              grep '^Compared with remote:' deploy-output.log || true
              echo ""
              echo "<details><summary>Full deploy log</summary>"
              echo ""
              echo '```'
              cat deploy-output.log
              echo '```'
              echo "</details>"
            else
              echo ""
              echo "_No deploy output captured — the deploy step did not run or failed before producing output._"
            fi
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/_deploy.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/_deploy.yml
git commit -m "ci: add reusable _deploy.yml workflow shared by test/qa/prod deploys"
```

---

### Task 2: Rewrite `deploy-qa.yml` as a thin wrapper

**Files:**
- Modify: `.github/workflows/deploy-qa.yml`

**Interfaces:**
- Consumes: `.github/workflows/_deploy.yml` from Task 1 (`environment`, `dry_run`, `prune`, `force` inputs).
- Produces: nothing further tasks depend on.

- [ ] **Step 1: Replace the entire file**

Replace the full current contents of `.github/workflows/deploy-qa.yml`:

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

with:

```yaml
name: Deploy QA

on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Pass --dry-run to preview the deploy plan without changing anything"
        type: boolean
        default: false
      prune:
        description: "Pass --prune to delete stale remote files the build no longer produces"
        type: boolean
        default: false
      force:
        description: "Pass --force to re-upload every file, even ones whose size is unchanged"
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  deploy:
    uses: ./.github/workflows/_deploy.yml
    with:
      environment: qa
      dry_run: ${{ inputs.dry_run }}
      prune: ${{ inputs.prune }}
      force: ${{ inputs.force }}
    secrets: inherit
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-qa.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-qa.yml
git commit -m "ci: rewrite deploy-qa.yml as a thin wrapper around the reusable deploy workflow"
```

---

### Task 3: Split `deploy-prod.yml` into `validate-qa` + a thin wrapper `deploy` job

**Files:**
- Modify: `.github/workflows/deploy-prod.yml`

**Interfaces:**
- Consumes: `.github/workflows/_deploy.yml` from Task 1.
- Produces: nothing further tasks depend on.

- [ ] **Step 1: Replace the entire file**

Replace the full current contents of `.github/workflows/deploy-prod.yml`:

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

          # Assumes <100 lifetime qa deployments; picks latest by created_at from page 1 (no pagination).
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

with:

```yaml
name: Deploy PROD

on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Pass --dry-run to preview the deploy plan without changing anything"
        type: boolean
        default: false
      prune:
        description: "Pass --prune to delete stale remote files the build no longer produces"
        type: boolean
        default: false
      force:
        description: "Pass --force to re-upload every file, even ones whose size is unchanged"
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  validate-qa:
    runs-on: ubuntu-latest
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

          # Assumes <100 lifetime qa deployments; picks latest by created_at from page 1 (no pagination).
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

  deploy:
    needs: [validate-qa]
    uses: ./.github/workflows/_deploy.yml
    with:
      environment: prod
      dry_run: ${{ inputs.dry_run }}
      prune: ${{ inputs.prune }}
      force: ${{ inputs.force }}
    secrets: inherit
```

Note: the `validate-qa` job's bash script is byte-for-byte identical to today's — only the FTP-deploy-specific steps at the end are removed (they now live in `_deploy.yml`, called by the new `deploy` job), and `validate-qa` becomes its own job rather than the first half of one long job.

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-prod.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-prod.yml
git commit -m "ci: split deploy-prod.yml into a validate-qa job and a thin wrapper deploy job"
```

---

### Task 4: Create `deploy-test.yml`

**Files:**
- Create: `.github/workflows/deploy-test.yml`

**Interfaces:**
- Consumes: `.github/workflows/_deploy.yml` from Task 1.
- Produces: nothing further tasks depend on.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Deploy TEST

on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Pass --dry-run to preview the deploy plan without changing anything"
        type: boolean
        default: false
      prune:
        description: "Pass --prune to delete stale remote files the build no longer produces"
        type: boolean
        default: false
      force:
        description: "Pass --force to re-upload every file, even ones whose size is unchanged"
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  deploy:
    uses: ./.github/workflows/_deploy.yml
    with:
      environment: test
      dry_run: ${{ inputs.dry_run }}
      prune: ${{ inputs.prune }}
      force: ${{ inputs.force }}
    secrets: inherit
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-test.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-test.yml
git commit -m "ci: add Deploy TEST workflow, mirroring deploy-qa.yml's thin-wrapper shape"
```

---

### Task 5: Add a custom tag-name input to `tag-release.yml`

**Files:**
- Modify: `.github/workflows/tag-release.yml`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing further tasks depend on.

- [ ] **Step 1: Replace the entire file**

Replace the full current contents of `.github/workflows/tag-release.yml`:

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

with:

```yaml
name: Tag Release

on:
  workflow_dispatch:
    inputs:
      tag_name:
        description: "Optional custom tag name (leave blank to auto-generate YYYY-MM-DD-<short-sha>)"
        type: string
        required: false
        default: ""

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
          if [ -n "${{ inputs.tag_name }}" ]; then
            name="${{ inputs.tag_name }}"
          else
            short_sha=$(git rev-parse --short=7 HEAD)
            date=$(date -u +%Y-%m-%d)
            name="${date}-${short_sha}"
          fi
          echo "name=${name}" >> "$GITHUB_OUTPUT"

      - name: Check if tag already exists
        id: check
        run: |
          existing_sha=$(git ls-remote --tags origin "refs/tags/${{ steps.tagname.outputs.name }}" | awk '{print $1}')
          if [ -z "$existing_sha" ]; then
            echo "exists=false" >> "$GITHUB_OUTPUT"
            echo "same_commit=false" >> "$GITHUB_OUTPUT"
          elif [ "$existing_sha" = "$GITHUB_SHA" ]; then
            echo "exists=true" >> "$GITHUB_OUTPUT"
            echo "same_commit=true" >> "$GITHUB_OUTPUT"
          else
            echo "exists=true" >> "$GITHUB_OUTPUT"
            echo "same_commit=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Refuse if the name collides with a different commit
        if: steps.check.outputs.exists == 'true' && steps.check.outputs.same_commit == 'false'
        run: |
          echo "::error::Tag '${{ steps.tagname.outputs.name }}' already exists and points at a different commit. Refusing to overwrite it."
          exit 1

      - name: Create and push tag
        if: steps.check.outputs.exists == 'false'
        run: |
          git tag "${{ steps.tagname.outputs.name }}"
          git push origin "${{ steps.tagname.outputs.name }}"

      - name: Summary
        if: always()
        run: |
          if [ "${{ steps.check.outputs.exists }}" = "true" ] && [ "${{ steps.check.outputs.same_commit }}" = "true" ]; then
            echo "Tag \`${{ steps.tagname.outputs.name }}\` already exists — nothing to do." >> "$GITHUB_STEP_SUMMARY"
          elif [ "${{ steps.check.outputs.exists }}" = "true" ]; then
            echo "Refused: tag \`${{ steps.tagname.outputs.name }}\` already exists and points at a different commit." >> "$GITHUB_STEP_SUMMARY"
          else
            echo "Created tag \`${{ steps.tagname.outputs.name }}\`." >> "$GITHUB_STEP_SUMMARY"
          fi
```

Note the added `if: always()` on the `Summary` step: it's needed now because the new `Refuse if the name collides...` step can fail the job (`exit 1`) before reaching `Summary` — without `always()`, a refused run would show no summary explaining why.

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/tag-release.yml')); print('valid yaml')"`
Expected: `valid yaml`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tag-release.yml
git commit -m "ci: add optional custom tag_name input to tag-release.yml"
```

---

### Task 6: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing from other tasks (pure documentation).
- Produces: accurate project documentation.

- [ ] **Step 1: Replace the "Deployment (auto TEST, tag-promoted QA/PROD)" bullet**

Replace this exact bullet (currently lines 43-56 of `CLAUDE.md`):

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
```

with:

```markdown
- **Deployment (auto TEST, tag-promoted TEST/QA/PROD):** a merge to `main`
  auto-deploys the built `public/` to **TEST** via the `deploy-test` job in
  `.github/workflows/ci.yml`. **TEST**, **QA**, and **PROD** are also each
  independently deployable on demand via `workflow_dispatch` workflows
  (`deploy-test.yml`, `deploy-qa.yml`, `deploy-prod.yml`) — no
  Required-reviewers approval gate; the deliberate act of dispatching one with a
  chosen ref *is* the gate. All three call one reusable workflow, `_deploy.yml`,
  so their deploy/summary logic stays in sync instead of drifting
  independently. Promotions are identified by git tags named
  `YYYY-MM-DD-<short-sha>` by default, or a custom name (see `tag-release.yml`),
  created from whichever commit you've verified on TEST; dispatching any of the
  three deploy workflows always uses GitHub's native branch/tag selector, never
  a free-text ref. `deploy-prod.yml` additionally checks, via the GitHub
  Deployments API, that its target commit was already successfully deployed to
  `qa` — refusing to proceed otherwise, even with `dry_run`. Rolling back is
  simply redeploying an older tag; there is no separate rollback mechanism.
  Every upload still **excludes the three server-owned files**
  (`.htaccess`, `robots.txt`, `config.php`). Those per-env files are placed once
```

- [ ] **Step 2: Replace the "Tagging a promotion candidate" and "QA / PROD deploy" bullets**

Replace these two exact bullets (currently lines 116-131 of `CLAUDE.md`):

```markdown
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

with:

```markdown
- **Tagging a promotion candidate:** `tag-release.yml` is a `workflow_dispatch`
  workflow with one optional input, `tag_name` — dispatch it from whatever
  commit you've verified on TEST (defaults to `main`); a blank `tag_name`
  creates (or, if already present, leaves alone) a tag named
  `YYYY-MM-DD-<short-sha>`; a non-blank `tag_name` is used instead — if that
  name already exists pointing at a different commit, the run refuses rather
  than moving it. Usable from the GitHub mobile app.
- **TEST / QA / PROD deploy (independent, tag-based):** `deploy-test.yml`,
  `deploy-qa.yml`, and `deploy-prod.yml` are separate `workflow_dispatch`
  workflows, each with `dry_run`/`prune`/`force` boolean inputs (mirroring
  `deploy.mjs`'s CLI flags of the same names — `--no-verify` deliberately
  excluded). All three call one reusable workflow, `_deploy.yml`, which does
  the actual checkout/build/deploy/summary. Dispatch any of them by picking a
  tag (or branch) from GitHub's native ref selector — never a typed-in ref.
  `deploy-prod.yml` additionally runs its own `validate-qa` job first, which
  checks the GitHub Deployments API for the `qa` environment's most recent
  successful deployment and refuses to proceed (even with `dry_run`) unless
  its commit matches the ref being deployed to PROD. None of the three has a
  Required-reviewers approval step. Each environment needs its own `FTP_DIR`
  secret (scoped to that Environment) plus the shared `FTP_HOST`/`USER`/`PASS`.
  Locally, `npm run deploy:test` / `deploy:qa` / `deploy:prod` do the same over
  FTP. Rolling back is redeploying an older tag with any of the three — no
  dedicated rollback mechanism exists. Each run's summary shows which flags
  were used, `deploy.mjs`'s own "N new, M changed, K unchanged, J stale" line,
  and the full deploy log in a collapsible section.
```

- [ ] **Step 3: Verify the edits**

Run: `grep -n "deploy-test.yml\|_deploy.yml\|tag_name" CLAUDE.md`
Expected: all three terms appear in the deployment section.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe Deploy TEST, reusable _deploy.yml, and tag_name in CLAUDE.md"
```

---

### Task 7: Update `staging/README.md`

**Files:**
- Modify: `staging/README.md`

**Interfaces:**
- Consumes: nothing from other tasks (pure documentation).
- Produces: accurate staging/deploy documentation.

- [ ] **Step 1: Replace the "## CI: decoupled tag-based promotion" section**

Replace this exact section (currently lines 149-180 of `staging/README.md`):

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

with:

```markdown
## CI: decoupled tag-based promotion

`ci.yml` only auto-deploys TEST. TEST (again, on demand), QA, and PROD are also
each separate, manually-dispatched workflows, all sharing one reusable
deploy workflow:

```
… checks … ─→ deploy-test        Tag Release ──┬─→ Deploy TEST (manual)
              (auto on main)                    ├─→ Deploy QA (manual)
                                                 └─→ Deploy PROD (manual, checks QA)
                              (manual, no inputs, or a custom tag_name)
```

- **TEST** deploys automatically after all checks pass on a merge to `main`.
- **Tag Release** (`tag-release.yml`) is a `workflow_dispatch` with one
  optional input, `tag_name` — dispatch it from the commit you've verified on
  TEST (defaults to `main`); blank `tag_name` creates (or no-ops if one
  already exists) a tag named `YYYY-MM-DD-<short-sha>`; a custom `tag_name` is
  used instead, refusing rather than moving it if that name already points at
  a different commit.
- **Deploy TEST** (`deploy-test.yml`), **Deploy QA** (`deploy-qa.yml`), and
  **Deploy PROD** (`deploy-prod.yml`) are independent `workflow_dispatch`
  workflows with `dry_run`/`prune`/`force` boolean inputs, all calling one
  shared reusable workflow (`_deploy.yml`) that does the actual
  checkout/build/deploy/summary — so the three stay in sync instead of
  drifting independently. Dispatch any of them by picking a tag from GitHub's
  native ref selector — never type a ref in by hand. No Required-reviewers
  approval gate on any of them — the deliberate act of dispatching with a
  chosen tag is the gate.
- **Deploy PROD** additionally runs its own `validate-qa` job first, which
  queries the GitHub Deployments API for the `qa` environment's most recent
  successful deployment and refuses to proceed (even with `dry_run`) unless
  its commit matches the ref being deployed to PROD.
- **Rollback** is redeploying an older tag with any of the three deploy
  workflows — there is no separate rollback mechanism or run-history lookup.
- Each `test`/`qa`/`prod` Environment needs `FTP_HOST`, `FTP_USER`, `FTP_PASS`
  and its own `FTP_DIR` secret (uniform name, scoped per Environment). The
  `deploy.mjs` path guard refuses any dir that does not match the env name.
- Each run's summary shows which flags were used, `deploy.mjs`'s own
  "N new, M changed, K unchanged, J stale" line, and the full deploy log in a
  collapsible section.
- A `deployment.json` at each site root (web-readable, e.g.
  `https://<prod-host>/deployment.json`) records the deployed commit, ref (the
  tag name, for TEST/QA/PROD manual deploys), time, and CI run URL.
```

- [ ] **Step 2: Verify the edits**

Run: `grep -n "Deploy TEST\|_deploy.yml\|tag_name" staging/README.md`
Expected: all three terms appear in the CI section.

- [ ] **Step 3: Commit**

```bash
git add staging/README.md
git commit -m "docs: describe Deploy TEST, reusable _deploy.yml, and tag_name in staging/README.md"
```
