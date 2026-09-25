---
status: accepted
date: 2026-07-23
decision-makers: André Hofer
---

# Deploy TEST on merge and promote QA and PROD by tag

## Context and Problem Statement

QA and PROD used to be jobs chained after TEST in the one CI run, each behind a
Required-reviewers gate. During the migration to Laravel every work-in-progress merge
parked at the QA gate indefinitely. With one maintainer, approving his own trigger a
second time added no safety. A "refuse stale commit" step existed only because an old
paused approval could be clicked after `main` had moved on, and rolling back meant
mining CI history for the previous version.

How does a commit reach TEST, QA and PROD, and how is a deploy rolled back?

## Considered Options

- Deploy TEST on merge, dispatch each environment by hand, and promote by tag
- Chained jobs behind Required-reviewers gates
- A QA job that promotes the latest green `main` run
- A rollback job that works out the previous version
- A free-text ref input
- Read QA's `deployment.json` over HTTP
- A check that QA matches TEST

## Decision Outcome

Chosen option: "Deploy TEST on merge, dispatch each environment by hand, and promote by
tag", because with one maintainer a second approval of his own trigger added no
safety, and dispatching a workflow with a chosen ref can itself be the gate.

- A merge to `main` deploys TEST automatically, from the `deploy-test` job in
  `.github/workflows/ci.yml`, once the all-green check passes.
- `deploy-test.yml`, `deploy-qa.yml` and `deploy-prod.yml` each run on
  `workflow_dispatch` with GitHub's own ref selector, and call the reusable
  `_deploy.yml`. Dispatching one with a chosen ref is the gate. No environment has
  Required reviewers.
- `tag-release.yml` names a promotion `YYYY-MM-DD-<short-sha>` or a custom name. It
  does nothing if the tag already points at the same commit and refuses if it points
  anywhere else.
- `deploy-prod.yml` checks through the GitHub Deployments API that QA's latest
  successful deployment is the same commit, and refuses otherwise, even on a dry run.
- Rolling back is redeploying an older tag.

Every deploy builds from the chosen ref. No artifact is carried between runs, so the
build has to be reproducible.

### Consequences

- Good, because promotions are deliberate.
- Good, because every tag is a permanent rollback target.
- Bad, because PROD cannot move until QA has been deployed with the same commit.
- Bad, because the Deployments API query reads one page, which holds while QA
  has fewer than 100 deployments.

As of 2026-09-25 QA and PROD both still run the site from before the rebuild.

### Confirmation

`tools/build.mjs` fails a build whose Composer metadata carries version-control
stamps.

## Pros and Cons of the Options

### Chained jobs behind Required-reviewers gates

- Bad, because every work-in-progress merge parked at the QA gate indefinitely during
  the migration to Laravel.
- Bad, because with one maintainer, approving his own trigger a second time added no
  safety.
- Bad, because an old paused approval could be clicked after `main` had moved on, which
  needed a "refuse stale commit" step, and rolling back meant mining CI history for the
  previous version.

### A QA job that promotes the latest green `main` run

Rejected; no reason was recorded.

### A rollback job that works out the previous version

Rejected; no reason was recorded. Rolling back is redeploying an older tag instead.

### A free-text ref input

- Bad, because it breaks `GITHUB_SHA` and `GITHUB_REF_NAME`.

### Read QA's `deployment.json` over HTTP

- Bad, because the runner cannot reach the site
  ([ADR-0008](0008-migrate-on-the-first-request-after-a-deploy.md)).

### A check that QA matches TEST

- Bad, because it would block rolling QA back.
