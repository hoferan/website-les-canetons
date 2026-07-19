# Unified, gated deploy pipeline (test → qa → prod in one workflow)

**Date:** 2026-07-19
**Status:** Approved (design)

## Problem

Deployment is split across two workflows:

- `ci.yml` runs on push/PR and, on merge to `main`, auto-deploys to **TEST**
  (`deploy-test` job).
- `deploy-qa.yml` is a separate `workflow_dispatch` workflow that resolves the
  latest green `main` CI run (what is on TEST) and promotes it to **QA**.
- **PROD** has no CI path at all — it is a manual WinSCP copy, and `deploy.mjs`
  has no `prod` target.

The maintainer wants a single pipeline (one workflow, one run graph) where TEST
deploys automatically and QA then PROD are **manual gates within the same run**:
"I'm in this run, test is green → I approve qa; qa is green → I approve prod."
Splitting QA/PROD into their own `workflow_dispatch` workflows works but breaks
that single-graph mental model and complicates the commit/branch story.

## Goals

1. One workflow (`ci.yml`) containing the whole pipeline as a chained job graph.
2. TEST auto-deploys on merge to `main`; QA and PROD are **manual approvals**
   inside the same run (no `workflow_dispatch`, no inputs).
3. Full PROD deploy over FTP from CI (replacing the manual WinSCP promotion),
   using the same `deploy.mjs` machinery as TEST/QA.
4. README badges for QA and PROD deployment status (and relabel all deploy
   badges to `CD - TEST/QA/PROD`).
5. A deployment marker file at each env's root so the maintainer can see exactly
   which commit is deployed where.
6. Surface the PHPUnit summary on PRs (sticky comment + check-run annotations),
   not just on the run page.
7. All docs updated to match.

## Non-goals

- Changing the build (`npm run build` → `public/`) — unchanged.
- Changing how server-owned files (`.htaccess`, `robots.txt`, `config.php`,
  `.htpasswd`) are handled — still excluded from every deploy.
- Enabling `--prune` in CI — stays off everywhere in CI (destructive deletes
  remain local/manual).

## Design

### 1. Workflow structure (`ci.yml`)

`deploy-qa.yml` is **deleted**. `ci.yml` gains two jobs after `deploy-test`,
forming one chained graph:

```
php,tests,assets,guard,build ─→ deploy-test ─→ deploy-qa ─→ deploy-prod
                                  (auto)        (gated)       (gated)
```

- `deploy-qa`: `needs: [deploy-test]`, `environment: qa`.
- `deploy-prod`: `needs: [deploy-qa]`, `environment: prod`.
- Both keep the same guard as `deploy-test`:
  `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`.
- Each gets its own `concurrency` group with `cancel-in-progress: false`
  (`deploy-qa` / `deploy-prod`), matching `deploy-test`. Concurrent merges queue
  in order rather than cancelling a run awaiting approval.

The pause/approve behavior comes entirely from **Required reviewers** on the
`qa` and `prod` GitHub Environments. The run reaches `deploy-qa`, GitHub blocks
it and shows "Review deployments"; the maintainer approves → it runs → same for
`deploy-prod`.

Because it is all one run on one commit, the "resolve the latest green TEST
commit" logic from `deploy-qa.yml` is **removed** — the commit is inherently the
run's commit (`GITHUB_SHA`). No `gh run list`, no `actions: read` permission for
promotion.

Each deploy job body mirrors the existing `deploy-test` job: checkout →
setup-node → `npm ci` → `npm run deploy:<env>`, with the env-specific
`FTP_*_DIR` secret.

### 2. `deploy.mjs` + scripts + secrets

- Add a `prod` target to `TARGETS` in `tools/deploy.mjs`:
  `prod: { dirVar: 'FTP_PROD_DIR', guard: /(^|[/.])prod([/.]|$)/i }`.
  The path guard hard-refuses to run unless `FTP_PROD_DIR` clearly points at a
  prod path — same safety pattern as test/qa.
- Add `"deploy:prod": "npm run build && node tools/deploy.mjs prod"` to
  `package.json`.
- New secret **`FTP_PROD_DIR`** on the `prod` GitHub Environment (the shared
  `FTP_HOST` / `FTP_USER` / `FTP_PASS` already exist).

This shifts PROD from "WinSCP copies the exact tested bytes" to "CI rebuilds
from the tested commit and FTPs it" — the same model TEST/QA already use.

### 3. Deployment marker file

`deploy.mjs` writes `deployment.json` into `public/` **just before upload**, so
it lands at the root of each env's folder. Shape:

```json
{
  "environment": "qa",
  "commit": "<full 40-char sha>",
  "shortCommit": "<7-char sha>",
  "ref": "main",
  "deployedAt": "<UTC ISO-8601>",
  "runUrl": "https://github.com/hoferan/website-les-canetons/actions/runs/<id>"
}
```

- Values come from CI env vars (`GITHUB_SHA`, `GITHUB_REF_NAME`,
  `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`). Local fallback:
  `git rev-parse HEAD` / `--short`, `git rev-parse --abbrev-ref HEAD`,
  `runUrl: null`. If git is unavailable, commit fields fall back to `"local"`.
- `deployedAt` is generated at deploy time (CI provides the wall clock).
- **Uploaded unconditionally**, bypassing the size-based change detection — a
  SHA is always the same byte length, so the "changed = different size" rule
  would otherwise skip it every time.
- **Prune-safe**: it lives in `public/`, so `--prune` counts it as "produced"
  and never deletes it. (`--prune` is off in CI anyway.)
- **Publicly web-served** at `/deployment.json` on all envs (staging stays
  behind Basic Auth; prod is public — an accepted minor info disclosure, like a
  `/version` endpoint).

### 4. Badges (README)

Add QA/PROD badges beside the existing TEST one, and **relabel all three** to
pair cleanly with the `CI` badge: `CD - TEST`, `CD - QA`, `CD - PROD` (the
current TEST badge's ugly `deploy test` label is replaced). Same GitHub
Deployments shields source (works regardless of Basic Auth, since it reads
GitHub's deployment API):

```
[![CD - TEST](https://img.shields.io/github/deployments/hoferan/website-les-canetons/test?label=CD%20-%20TEST)](https://github.com/hoferan/website-les-canetons/deployments)
[![CD - QA](https://img.shields.io/github/deployments/hoferan/website-les-canetons/qa?label=CD%20-%20QA)](https://github.com/hoferan/website-les-canetons/deployments)
[![CD - PROD](https://img.shields.io/github/deployments/hoferan/website-les-canetons/prod?label=CD%20-%20PROD)](https://github.com/hoferan/website-les-canetons/deployments)
```

Every `environment:` job automatically creates a deployment record, so these
populate with no extra wiring.

**No separate test/coverage badge** — the `CI` badge already goes red when the
`tests` job fails, and the detailed results are surfaced on the PR (§4a). A
coverage badge is deferred (would need a coverage driver + external publishing).

### 4a. PR test reporting

The `tests` job surfaces the PHPUnit results on PRs, in addition to the existing
`$GITHUB_STEP_SUMMARY`, two ways:

1. **Sticky PR comment** — reuse `tools/phpunit-summary.mjs`: write its markdown
   to a file (`summary.md`), append it to `$GITHUB_STEP_SUMMARY` as today **and**
   feed the same file to `marocchino/sticky-pull-request-comment` (a fixed
   `header:` makes it update one comment in place instead of spamming). No change
   to `phpunit-summary.mjs` — just capture to a file and use it twice.
2. **Check run + inline annotations** — `mikepenz/action-junit-report` reads
   `junit.xml` and publishes a check with a per-test breakdown and annotations on
   failing lines in the diff.

Both steps run `if: always()` so failures still report.

Permissions: add a **job-level** `permissions:` block to `tests` only —
`pull-requests: write` (sticky comment) + `checks: write` (check run) — rather
than widening the global `permissions: contents: read`. Least privilege stays
intact for every other job.

Fork PRs: `GITHUB_TOKEN` is read-only on forks, so the comment/check can't post
there; acceptable for this single-maintainer repo, and the step-summary still
works. These steps only run on `pull_request` events.

### 5. Docs

- **CLAUDE.md** — rewrite the deploy bullets: single gated pipeline in `ci.yml`;
  QA and PROD are manual approvals via Required reviewers (not separate
  workflows); PROD now deploys over FTP (remove "prod stays a manual WinSCP
  promotion" statements); document `FTP_PROD_DIR` and the `prod` target guard;
  document `deployment.json`.
- **README.md** — relabelled `CD - TEST/QA/PROD` badges; update the deploy-flow
  description; mention PR test reporting (sticky comment + check run).
- **staging/README.md** — describe the unified gated flow and the marker file;
  reconcile the WinSCP test→qa→prod copy narrative with the new FTP-based
  promotion.
- **.env.example** — add `FTP_PROD_DIR` with a prod-path example.

## Prerequisites (maintainer, outside the repo)

1. **Required reviewers must be enabled** on the `qa` and `prod` GitHub
   Environments (maintainer as reviewer) — this is what creates the manual gate.
   Without it, the jobs run automatically with no pause.
2. Add the **`FTP_PROD_DIR`** secret to the `prod` Environment.

## Risks & mitigations

- **Gate not actually enforced** if Required reviewers aren't set → jobs
  auto-run. Mitigation: called out as an explicit prerequisite; verify on GitHub
  before first merge.
- **Pending-approval pile-up** if many merges land during an approval →
  mitigated by per-env `concurrency` groups (`cancel-in-progress: false`, queued
  in order).
- **Marker never changing size** → uploaded unconditionally to force refresh.
- **PROD bytes differ from tested bytes** (rebuild vs byte-copy) → same
  deterministic `npm run build` from the same commit that TEST/QA used; identical
  model already trusted for TEST/QA.

## Testing / verification

- `npm run check` and `npm run test:php` pass.
- `deploy.mjs`: prod target rejects a non-prod `FTP_PROD_DIR` (guard test);
  `--dry-run` for prod lists a sane plan.
- Marker file: valid JSON with expected keys; correct short SHA; uploaded even
  when only the SHA changed (size unchanged).
- CI: on a merge to `main`, run reaches `deploy-qa` and blocks on approval;
  after approval reaches `deploy-prod` and blocks again; badges update.
