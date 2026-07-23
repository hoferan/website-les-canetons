# CI: Decoupled QA/PROD Promotion via Tags — Design

**Date:** 2026-07-23
**Status:** Approved (design)

**Supersedes:**
- `2026-07-19-unified-gated-deploy-pipeline-design.md` §1 (chained `deploy-qa`/
  `deploy-prod` jobs in one `ci.yml` run) and its Required-reviewers
  prerequisite. That spec's `deploy-test` job and its `deployment.json` marker
  format (§3) remain valid and are reused unchanged here.
- `2026-07-22-ci-manual-deploy-prune-and-rollback-design.md` in full. It was
  approved but never implemented (`ci.yml` today has no `workflow_dispatch`,
  no `prune`/`rollback` inputs). Its `rollback-plan` job — auto-detecting "the
  previous version" from CI run history — is replaced by tag-based redeploy
  (§7 below). Its `prune` input is preserved, re-homed onto the new
  independent workflows (§8).

Both superseded files get a short pointer note added at the top; they are not
deleted, so the history of how the design got here stays intact.

## Problem

The current pipeline is a single `ci.yml` run: a merge to `main` auto-deploys
to TEST, then `deploy-qa`/`deploy-prod` are jobs chained via `needs:` in that
*same run*, paused for a Required-reviewers approval on the `qa`/`prod`
GitHub Environments. This project is about to start a large migration
(splitting the site into a React/Tailwind frontend and a Laravel PHP API),
developed against a TEST environment used to validate the new stack before
touching QA/PROD. Under the current model, every merge to `main` during that
migration — including routine WIP merges nobody intends to promote — starts a
run that pauses at the QA gate indefinitely, whether or not the maintainer
wants QA/PROD touched at all.

The maintainer (solo developer, repo is public) wants QA and PROD to become
deliberate, independently-triggered actions, decoupled from `main`'s merge
cadence, while preserving the property that QA and PROD only ever receive
code that was actually validated on the environment before it.

## Goals

1. Merge to `main` continues to auto-deploy to TEST only — unchanged.
2. QA and PROD each become an independent `workflow_dispatch`-triggered
   workflow, not chained to the TEST auto-deploy run.
3. The "exact bytes tested get promoted" property is preserved via
   deterministic rebuild-from-commit (the same model TEST/QA/PROD already
   use today), not via artifact upload/download between jobs.
4. PROD can only be deployed from a commit that has already been
   successfully deployed to QA.
5. No Required-reviewers approval step on `qa`/`prod` — for a solo
   maintainer, a second approval click on your own trigger adds no real
   safety, and the repo being public doesn't change who can trigger
   `workflow_dispatch` (write access is required regardless of visibility).
6. A lightweight git tag identifies exactly which commit was promoted —
   human-readable, and creatable from a phone via the GitHub mobile app.
7. Rolling back is just redeploying an older tag — no separate rollback
   mechanism.
8. An optional `--prune` passthrough is preserved on the new workflows.

## Non-goals

- No changes to `tools/deploy.mjs`'s build/upload/verify mechanics — reused
  exactly as today.
- No changes to how `npm run dbmigrate:<env>` is run — out of scope for this
  design, unaffected by it.
- No GitHub Releases, changelog generation, or other release ceremony — a
  plain git tag is enough.
- No artifact upload/download between jobs — rebuild-from-ref stays the
  model (per the confirmed decision below).
- No change to the public marketing pages / frontend-backend split itself —
  this spec is CI/deploy-pipeline-only, one of several sub-projects in the
  larger migration (see the decomposition agreed earlier: this is sub-project
  #1 of 4).

## Design

### 1. `ci.yml` changes

- The `deploy-qa` and `deploy-prod` jobs are deleted.
- `php`, `tests`, `assets`, `guard`, `build`, and `deploy-test` are unchanged:
  same triggers, same `needs:` graph, same `environment: test` (which keeps
  no Required-reviewers rule, as today).
- **The old "Refuse stale commit" step is dropped, not carried forward.** It
  existed on `deploy-qa`/`deploy-prod` solely to catch an *old, paused
  approval* being clicked after `main` had advanced past it — a failure mode
  that only exists when jobs are chained in one push-triggered run behind an
  approval gate. Once QA/PROD are independent `workflow_dispatch` triggers
  with no approval gate, every trigger is a fresh, deliberate action against
  whatever ref was just picked, so that scenario can't occur. It is not
  replaced by an equivalent check — PROD's QA-match check (§4) is a
  different guarantee (QA was actually deployed first), not a replacement
  for this one.

### 2. New workflow: `tag-release.yml`

Purpose: create a permanent, human-readable pointer to a commit you've
decided is worth promoting — usually right after eyeballing it on TEST.

- Trigger: `workflow_dispatch`, **no custom inputs**. Dispatched via GitHub's
  native "Run workflow from: [branch/tag ▾]" selector, defaulting to `main`
  — usable from the GitHub mobile app with a single tap.
- Steps:
  1. Checkout at the dispatch ref (plain `actions/checkout@v5`, no `ref:`
     override needed — the native selector already makes `GITHUB_SHA`
     correct for the picked ref).
  2. Compute the tag name (§5): today's UTC date + a dash + the 7-character
     short SHA.
  3. Check whether that exact tag already exists on `origin`
     (`git ls-remote --tags origin <name>`). If it does, the job succeeds as
     a no-op — since the SHA is baked into the tag name, an existing tag
     with that name can only already point at this same commit, so there is
     nothing to redo. This makes the workflow safe to re-run by accident.
  4. Otherwise, `git tag <name> && git push origin <name>`.
  5. Print the resulting tag name to `$GITHUB_STEP_SUMMARY`, so it's visible
     on the run page to copy into the next step.
- Permissions: `contents: write`, scoped to this job only (every other job
  across all workflows stays `contents: read`).

### 3. New workflow: `deploy-qa.yml`

- Trigger: `workflow_dispatch`, native ref selector (pick the tag created in
  §2 — or, in principle, any branch/tag). Plus one boolean input, `prune`
  (§8), default `false`.
- Steps: checkout at the selected ref → `npm ci` →
  `npm run deploy:qa -- ${{ inputs.prune && '--prune' || '' }}`. Identical
  rebuild-from-source mechanism `deploy-test` already uses today, just
  against whatever ref was picked instead of always `main`'s tip.
- `environment: qa` stays on the job (keeps `FTP_HOST`/`FTP_USER`/
  `FTP_PASS`/`FTP_DIR` scoped to this environment's secrets), but the
  Required-reviewers protection rule on the `qa` environment is removed in
  GitHub repo settings (§6) — a settings change, not a workflow-file change.
- Because the native ref selector is used (never a free-text custom ref
  input), `GITHUB_SHA` and `GITHUB_REF_NAME` are automatically correct for
  whatever was picked — no manual override step is needed, unlike the
  free-text-input design considered and rejected earlier in brainstorming.
- **Deliberately no "must match TEST" check here**, unlike PROD's check
  against QA (§4). `deploy-test` auto-deploys on every merge to `main`, so
  in practice any commit worth promoting to QA is already on TEST by the
  time you'd promote it. Requiring an explicit match would only add
  friction, and would block a deliberate rollback to an older tag that
  predates what's currently on TEST — a case that should stay possible.

### 4. New workflow: `deploy-prod.yml`

- Trigger: `workflow_dispatch`, native ref selector (pick the same tag used
  for the QA deploy). Plus the same `prune` boolean input.
- Steps:
  1. Checkout at the selected ref.
  2. Query the GitHub Deployments API for the most recent deployment to the
     `qa` environment whose latest status is `success`.
  3. Compare that deployment's commit SHA to this run's `GITHUB_SHA`.
  4. **Fail closed**: if they don't match, or if the API query itself fails
     (network error, permissions issue, no qa deployments found at all), the
     job fails with an error naming both SHAs (or the query failure) and
     instructing the maintainer to deploy this ref to QA first. It never
     silently proceeds when the check is inconclusive.
  5. On a match, `npm ci` → `npm run deploy:prod -- ${{ inputs.prune &&
     '--prune' || '' }}`.
- Permissions: `deployments: read`, scoped to this job only, in addition to
  the default `contents: read`.
- `environment: prod` stays on the job for secret scoping; Required-reviewers
  is removed here too (§6).
- Prints the tag it deployed, and the QA deployment's tag it matched
  against, to `$GITHUB_STEP_SUMMARY` (§9).

### 5. Tag naming convention

`YYYY-MM-DD-<short-sha>`, e.g. `2026-07-23-a1b2c3d` — ISO-8601 date (the
least ambiguous common date format), a single dash separator, then the
7-character short SHA (matching the `shortCommit` field `deploy.mjs` already
computes). The date is always the current UTC date at tag-creation time. The
SHA suffix makes tag names collision-free without any manual counter — two
different commits can never produce the same tag name, even multiple times
in one day.

### 6. Environment / secrets / permissions changes

- **Repo settings (outside any YAML file):** remove the Required-reviewers
  protection rule from both the `qa` and `prod` GitHub Environments.
  Everything else about those Environments (their secrets) stays as-is.
- **No new secrets.** The QA/PROD deploy workflows reuse the existing
  `FTP_HOST`/`FTP_USER`/`FTP_PASS`/`FTP_DIR` secrets already scoped to each
  environment. No Basic Auth credentials are needed anywhere in this design
  — the earlier idea of fetching QA's live `deployment.json` over HTTP (which
  would have needed `BASIC_AUTH_USER`/`BASIC_AUTH_PASS`) was replaced by the
  GitHub Deployments API check in §4, which needs no site-reachability
  dependency at all.
- **New job-scoped permissions**, each added only to the one job that needs
  it (the blanket `permissions: contents: read` at the top of every workflow
  stays the default for all other jobs):
  - `tag-release.yml`'s tagging job: `contents: write`.
  - `deploy-prod.yml`'s deploy job: `deployments: read`.

### 7. Rollback (supersedes 2026-07-22's `rollback-plan` mechanism)

The superseded spec needed to auto-detect "the previous version" from CI run
history because nothing else recorded what was previously live where. Under
this design, every real promotion is a named, permanent tag. Rolling back a
bad QA or PROD deploy is simply: dispatch `deploy-qa.yml` or `deploy-prod.yml`
again and pick an **older** tag from the native ref selector. No run-history
querying, no dedicated rollback input or job. This works because tags are
never force-moved or deleted by this design (§2's idempotency check only
skips *recreating* an identical tag — nothing ever rewrites one) — every past
promotion remains selectable indefinitely.

### 8. Prune (ported from 2026-07-22)

`deploy-qa.yml` and `deploy-prod.yml` each take a `prune` boolean input
(default `false`, matching the superseded spec's intent). When `true`, it's
passed through to `deploy.mjs` as `--prune`, deleting stale remote files the
current build no longer produces. `deploy.mjs`'s existing per-target path
guard (refusing to run unless the target's `FTP_DIR` secret clearly matches
the environment name) already protects against pruning the wrong
environment, unchanged by this design.

### 9. Visibility: which tag is deployed where

- **`deployment.json`** on each live server already gets this for free: its
  `ref` field is populated from `GITHUB_REF_NAME`, which — because these
  workflows are always dispatched via the native tag selector, never a
  free-text input — equals the tag name for any QA/PROD deploy. No code
  change needed; this is how `deploy.mjs` already works today.
- **GitHub's Environments/Deployments UI** should also reflect the tag as
  each deployment's ref, since it's tied to the run's actual dispatch ref —
  this should be confirmed empirically once `deploy-qa.yml` exists, rather
  than assumed.
- **Job summaries**: both `deploy-qa.yml` and `deploy-prod.yml` print the tag
  they deployed to `$GITHUB_STEP_SUMMARY`; `deploy-prod.yml` additionally
  prints the QA deployment's tag it matched against (§4), so the match is
  visible directly on the run page, not just inferable from
  `deployment.json` or the Environments UI.

## Testing / verification

This is a CI/deploy-pipeline configuration change with no unit-test coverage
(no `tests/` coverage exists for `.github/workflows/*.yml` in this project).
Verification is manual:

1. Push `tag-release.yml` and `deploy-qa.yml` on a feature branch and dispatch
   both "from" that branch — QA is already a low-stakes staging environment,
   so this can be exercised for real before merging.
2. Confirm `tag-release.yml`'s idempotency: dispatch it twice against the
   same commit same day; the second run must no-op rather than error or
   create a duplicate/conflicting tag.
3. Confirm `deploy-qa.yml`'s `prune` input reaches `deploy.mjs` correctly
   (compare a dispatch with `prune: false` against one with `prune: true`
   using `deploy.mjs`'s existing `--dry-run` support first).
4. Validate `deploy-prod.yml`'s Deployments-API check logic without ever
   running a real FTP upload to PROD: dry-run the final step
   (`npm run deploy:prod -- --dry-run`) to confirm the SHA-matching logic
   passes/fails correctly, before ever trusting it against the live PROD
   deploy step.
5. Confirm the fail-closed cases: no `qa` deployments exist yet; the `qa`
   environment's latest deployment status is a failure, not success; the API
   query itself errors (simulate by breaking permissions temporarily). All
   three must refuse to deploy, never proceed silently.
6. Confirm `deployment.json`'s `ref` field shows the tag name after a real
   QA dispatch, and check whether GitHub's Environments UI does too (§9).

## Prerequisites (maintainer, outside the repo)

1. Remove the Required-reviewers protection rule from the `qa` and `prod`
   GitHub Environments.
2. No new secrets to add — existing `FTP_*` secrets per environment are
   reused as-is.

## Risks & mitigations

- **Tag name collision** — structurally impossible: the short SHA is part of
  the name, so two different commits can never produce the same tag name.
- **PROD deploy proceeds without real QA validation** — mitigated by
  fail-closed behavior (§4.4): any ambiguity (API error, no match, no QA
  deployment found) refuses the deploy rather than proceeding.
- **Marker/UI showing the wrong ref** — mitigated by relying exclusively on
  the native `workflow_dispatch` ref selector (never a custom free-text
  input) for QA/PROD triggers, which keeps `GITHUB_SHA`/`GITHUB_REF_NAME`
  accurate without any manual override step.
- **Superseded specs causing confusion later** — mitigated by adding a
  pointer note at the top of both superseded files rather than deleting them.

## Documentation

- `CLAUDE.md`'s deployment section: rewrite to describe the three new
  workflows, the tagging convention, dropped Required-reviewers, and the
  "rollback = redeploy an older tag" model. Remove references to the chained
  single-run qa/prod gate.
- Add a short "Superseded by this spec" note at the top of
  `2026-07-19-unified-gated-deploy-pipeline-design.md` (§1/prerequisites
  only — its `deploy-test` and `deployment.json` sections remain valid) and
  `2026-07-22-ci-manual-deploy-prune-and-rollback-design.md` (in full).
- `staging/README.md`: update the deploy-flow description to match.
