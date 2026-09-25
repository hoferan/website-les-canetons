# 0006. Deploy TEST on merge and promote QA and PROD by tag

Status: Accepted, 2026-07-23

## Context

QA and PROD used to be jobs chained after TEST in the one CI run, each behind a
Required-reviewers gate. During the migration to Laravel every work-in-progress merge
parked at the QA gate indefinitely. With one maintainer, approving his own trigger a
second time added no safety. A "refuse stale commit" step existed only because an old
paused approval could be clicked after `main` had moved on, and rolling back meant
mining CI history for the previous version.

## Decision

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
build has to be reproducible, and `tools/build.mjs` fails a build whose Composer
metadata carries version-control stamps.

Rejected: chained gated jobs; a QA job that promotes the latest green `main` run; a
rollback job that works out the previous version; a free-text ref input, which breaks
`GITHUB_SHA` and `GITHUB_REF_NAME`; reading QA's `deployment.json` over HTTP, which
the runner cannot reach (ADR 0008); and a check that QA matches TEST, which would block
rolling QA back.

## Consequences

Promotions are deliberate and every tag is a permanent rollback target.

PROD cannot move until QA has been deployed with the same commit. As of 2026-09-25 QA
and PROD both still run the site from before the rebuild.

The Deployments API query reads one page, which holds while QA has fewer than 100
deployments.
