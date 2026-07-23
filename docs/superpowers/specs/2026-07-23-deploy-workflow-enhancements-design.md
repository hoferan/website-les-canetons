# Deploy Workflow Enhancements: Deploy TEST, More Flags, Richer Summaries — Design

**Date:** 2026-07-23
**Status:** Approved (design)

**Builds on:** `2026-07-23-decoupled-qa-prod-tag-promotion-design.md` (the tag-based
`tag-release.yml`/`deploy-qa.yml`/`deploy-prod.yml` pipeline this enhances) — the
maintainer manually verified that pipeline works end-to-end after merge, then
asked for these follow-up improvements.

## Problem

The just-shipped pipeline covers QA and PROD as independent, tag-based
`workflow_dispatch` workflows, but three gaps remain for day-to-day use:

1. **TEST has no manual/tag-based deploy path.** It only auto-deploys `main`'s
   tip via `ci.yml`'s push-triggered `deploy-test` job — there's no way to
   redeploy an older tag to TEST, or to run it with `--prune`, without a new
   merge to `main`.
2. **Only `prune` is exposed as a workflow input.** `tools/deploy.mjs` also
   supports `--dry-run` and `--force`, but today those are only reachable by
   running the script by hand locally.
3. **The summaries are minimal.** Each deploy workflow's summary is a single
   line (e.g. "Deployed tag `X` (`Y`) to QA.") — it doesn't say which flags
   were used, and none of `deploy.mjs`'s own useful output (file counts, the
   dry-run plan) reaches the GitHub Actions summary; it's only in the raw log.

## Goals

1. Add a `Deploy TEST` workflow, matching `Deploy QA`/`Deploy PROD`'s shape
   (native ref/tag selector, tag-based) — purely additive; `ci.yml`'s
   push-triggered `deploy-test` job is unchanged.
2. Add `dry_run` and `force` boolean inputs to all three deploy workflows,
   alongside the existing `prune`. (`--no-verify` is deliberately NOT exposed —
   see Non-goals.)
3. Extract the shared deploy logic (checkout → setup → `npm run deploy:<env>`
   → summary) into one reusable `workflow_call` workflow, so TEST/QA/PROD stay
   in sync automatically instead of three files drifting independently.
4. Enhance the summary, uniformly across all three: which flags were used,
   `deploy.mjs`'s own "N new, M changed, K unchanged, J stale" line surfaced
   directly, and the full `deploy.mjs` log available in a collapsible section.
5. Add an optional custom tag-name input to `tag-release.yml`, so a specific
   tag name can be chosen instead of the auto-generated
   `YYYY-MM-DD-<short-sha>` when needed.

## Non-goals

- **Not exposing `--no-verify` as a workflow input.** It skips the one check
  that catches a truncated/failed upload; the maintainer chose not to make
  that reachable from a dropdown. It stays CLI-only for local hand-runs.
- **Not changing `tools/deploy.mjs` itself.** All of its flags, output format,
  and behavior are reused exactly as-is; this design only changes how CI
  invokes it and what CI does with its output.
- **Not adding a "force-overwrite an existing tag" mode.** The maintainer
  explicitly chose the custom-name-input approach over a force-overwrite
  boolean; a custom name that collides with a different commit's tag refuses
  rather than moving it.
- **Not changing `deploy-prod.yml`'s QA-validation logic.** Its bash script
  (query the Deployments API, fail closed on mismatch) is unchanged in
  substance — only its packaging (its own job instead of an inline step)
  changes, per the reusable-workflow restructure.
- **Not adding GitHub Releases, changelog generation, or a link to the live
  site/`deployment.json` in the summary** — the maintainer considered and
  declined the live-link option when asked what to improve about summaries.

## Design

### 1. Reusable workflow: `.github/workflows/_deploy.yml`

`on: workflow_call` only — no `workflow_dispatch`/`push` trigger of its own,
so it never appears as a directly-runnable workflow in the Actions UI; it only
runs when another workflow's job calls it via `uses:`.

**Inputs:**
- `environment` (string, required) — `test` | `qa` | `prod`.
- `dry_run` (boolean, default `false`)
- `prune` (boolean, default `false`)
- `force` (boolean, default `false`)

**Job** (`deploy`):
- `environment: ${{ inputs.environment }}` — scopes `FTP_HOST`/`FTP_USER`/
  `FTP_PASS`/`FTP_DIR` to whichever environment's secrets the caller asked for.
- `concurrency: { group: deploy-${{ inputs.environment }}, cancel-in-progress: false }`
  — preserves today's per-environment concurrency guard.
- Steps: `actions/checkout@v5` → `actions/setup-node@v5` (node 20) →
  `shivammathur/setup-php@v2` (php 8.4) → `npm ci` → the deploy step (§2) →
  the summary step (§4, `if: always()` so it runs even if the deploy step
  failed, since `tee` will have captured whatever ran before the failure).

**Deploy step:**
```yaml
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
```

### 2. Wrapper workflows

**`deploy-test.yml`** and **`deploy-qa.yml`** (near-identical): `workflow_dispatch`
with the three boolean inputs (`dry_run`, `prune`, `force` — same descriptions
each), native ref/tag selector for which commit to deploy, one job that calls
`_deploy.yml`:

```yaml
jobs:
  deploy:
    uses: ./.github/workflows/_deploy.yml
    with:
      environment: test   # or qa
      dry_run: ${{ inputs.dry_run }}
      prune: ${{ inputs.prune }}
      force: ${{ inputs.force }}
    secrets: inherit
```

**`deploy-prod.yml`** keeps its existing QA-validation logic, now as its own
job gating the reusable deploy job via `needs:`:

```yaml
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
          # unchanged from today's deploy-prod.yml: query the Deployments API
          # for qa's most recent successful deployment, fail closed on any
          # mismatch, missing deployment, or non-success status.
          ...

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

Splitting validation into its own job is a small incidental improvement: its
summary (which tag/commit it matched against) becomes visible on the run page
as soon as it completes, before the deploy job even starts.

### 3. Flag semantics

- `dry_run`/`prune`/`force` map 1:1 to `deploy.mjs`'s existing `--dry-run`/
  `--prune`/`--force` flags — no new behavior in the script itself.
- **PROD's QA-validation check runs regardless of `dry_run`.** A dry-run is a
  preview of what a real deploy would do; if the target commit doesn't match
  QA's last successful deployment, a real deploy would refuse — so the
  preview refuses too, rather than showing a misleadingly clean plan for a
  commit that couldn't actually be deployed.

### 4. Enhanced summary (built once in `_deploy.yml`, used by all three)

```yaml
- name: Summary
  if: always()
  run: |
    {
      echo "### Deploy to ${{ inputs.environment }}"
      echo "- Ref: \`${GITHUB_REF_NAME}\` (\`${GITHUB_SHA}\`)"
      echo "- Flags: dry-run=${{ inputs.dry_run }}, prune=${{ inputs.prune }}, force=${{ inputs.force }}"
      grep '^Compared with remote:' deploy-output.log || true
      echo ""
      echo "<details><summary>Full deploy log</summary>"
      echo ""
      echo '```'
      cat deploy-output.log
      echo '```'
      echo "</details>"
    } >> "$GITHUB_STEP_SUMMARY"
```

- The flags line reads directly from the workflow's own inputs — no log
  parsing needed for that part.
- The one-line file-count summary (`Compared with remote: N new, M changed,
  K unchanged, J stale.`) is `deploy.mjs`'s own existing output line, grepped
  out of the captured log and surfaced at the top level.
- The full log (including the complete dry-run plan when `dry_run` is on)
  is preserved in full inside a collapsible `<details>` block, so nothing is
  lost, but the summary isn't a wall of text by default.
- `tag-release.yml`'s summary is unchanged — it already states the tag name
  clearly and wasn't flagged as needing improvement.

### 5. `tag-release.yml`: custom tag-name input

New optional input:
```yaml
tag_name:
  description: "Optional custom tag name (leave blank to auto-generate YYYY-MM-DD-<short-sha>)"
  type: string
  required: false
  default: ""
```

Updated logic:
1. Compute the name: `inputs.tag_name` if non-empty, else today's
   `YYYY-MM-DD-<short-sha>` auto-generation (unchanged).
2. Look up what that name currently points to on `origin` (if anything):
   `git ls-remote --tags origin refs/tags/<name>`, extracting the SHA field
   (lightweight tags produce exactly one line — no peeled-ref ambiguity).
3. **Doesn't exist:** create and push it (unchanged behavior).
4. **Exists, same commit:** no-op, as today — this is always true for an
   auto-generated name (the SHA is baked into it) and may also be true for a
   re-run against the same commit with an explicit custom name.
5. **Exists, different commit:** refuse the run with a clear error — this
   case is structurally impossible for an auto-generated name, and only ever
   triggers for a custom name that collides with an unrelated tag.

No separate format validation is added for a custom `tag_name` — `git tag
<name>` already rejects an invalid ref name (spaces, `~`, `^`, `:`, etc.) on
its own, and that failure surfaces as a normal job failure with git's own
error message, which is sufficient; duplicating git's own validation would
be redundant.

## Testing / verification

Same constraints as the original pipeline: no unit-test coverage exists for
`.github/workflows/*.yml`, and (per the prior spec's discovery) a
`workflow_call`-only workflow and its callers must exist on `main` before any
of this can be dispatched for real — so, as before, verification is manual,
after merge:

1. Dispatch `Deploy TEST` with all flags off, confirm it behaves like a plain
   redeploy of the selected tag/branch to TEST.
2. Dispatch any one of the three with `dry_run: true`, confirm the summary's
   grepped count line and collapsible full log both show the dry-run plan
   and no files are actually changed on the server.
3. Dispatch with `force: true` against an already-up-to-date target, confirm
   every file is re-uploaded despite unchanged size.
4. Dispatch `Deploy PROD` with a ref that does NOT match QA's last successful
   deployment, confirm `validate-qa` fails closed and `deploy` never starts —
   including with `dry_run: true`, confirming §3's "validation runs regardless
   of dry-run" rule.
5. Dispatch `Tag Release` with a blank `tag_name`, confirm auto-generation is
   unchanged. Dispatch with a custom `tag_name` that doesn't exist yet,
   confirm it's created. Re-dispatch with the same custom name and commit,
   confirm no-op. Dispatch with a custom name already used by an unrelated
   tag (different commit), confirm it refuses.

## Documentation

- `CLAUDE.md` and `staging/README.md`: update the deployment sections (written
  in the prior spec's implementation) to mention `Deploy TEST`, the
  `dry_run`/`force` inputs, the reusable-workflow structure, the enhanced
  summaries, and `tag-release.yml`'s custom-name input.
