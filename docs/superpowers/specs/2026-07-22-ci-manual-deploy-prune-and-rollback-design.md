# CI: Manual Deploy Dispatch — Prune Cleanup & Rollback — Design

> **Superseded in full** by `2026-07-23-decoupled-qa-prod-tag-promotion-design.md`.
> This spec was approved but never implemented. Its `rollback-plan` job
> (auto-detecting "the previous version" from CI run history) is replaced by
> tag-based redeploy — every promotion is now a permanent tag, so rolling
> back is just redeploying an older one. Its `prune` input survives, re-homed
> onto the newer design's independent `deploy-qa.yml`/`deploy-prod.yml`
> workflows instead of the chained `ci.yml` jobs described below.

**Date:** 2026-07-22
**Status:** Superseded
**Scope:** Filed from a conversation during issue #4 planning — not (yet) its own
GitHub issue. Adds a `workflow_dispatch` trigger to `.github/workflows/ci.yml`
with two independent, rarely-used boolean inputs: `prune` (clean up stale
remote FTP files) and `rollback` (redeploy the previous version, auto-detected —
no input needed beyond the flag itself). Both reuse the existing test→qa→prod
pipeline and its approval gates unchanged; neither adds a new deploy code path.

## 1. Context

Today `ci.yml` only triggers on `push` (to `main`) and `pull_request` — there is
no manual trigger. `deploy-test`/`deploy-qa`/`deploy-prod` always deploy
`main`'s current tip, and never pass `--prune` (per the comment in `ci.yml`:
"destructive deletes stay manual/local"). Two gaps surfaced during a
conversation about issue #4 (which will introduce Vite's content-hashed
filenames, making stale-file cleanup a real recurring need rather than a
theoretical one):

1. **Pruning stale FTP files** today requires running `npm run deploy:<env> --
   --prune` by hand from a local checkout with the right `.env.<env>`
   credentials — there's no way to do it from CI.
2. **Rolling back a bad deploy** today means checking out an older commit
   locally and running the deploy script by hand — same friction, and requires
   the maintainer to already know (or go dig up) which commit was previously
   live.

Both are rare, deliberate, maintainer-triggered actions — not something that
should ever happen from a routine merge to `main`.

## 2. Goals / Non-Goals

**Goals**

1. A `workflow_dispatch` trigger on `ci.yml`, runnable from the Actions tab or
   `gh workflow run`.
2. A `prune` boolean input: when true, passes `--prune` to all three
   `deploy:<env>` steps in that run.
3. A `rollback` boolean input: when true, automatically determines "the
   previous version" from CI run history and deploys it — no SHA/tag to look
   up or type in by hand.
4. Both inputs are independent and optional; omitting both reproduces today's
   push-triggered behavior exactly.
5. A human-readable summary of what a rollback resolved to (current vs.
   previous commit, each with message/date/run link) surfaces before deploy so
   a maintainer can confirm it's right — reusing the existing qa/prod
   Required-reviewers gates rather than adding new approval infrastructure.
6. Preserve every existing safety property: `php`/`tests`/`assets`/`guard`/
   `build` still gate the deploy jobs, and `qa`/`prod` still require their
   GitHub Environment's Required-reviewers approval.

**Non-Goals**

- No fast path that deploys to a single environment only (e.g. prod-only
  rollback) — both features go through the full test→qa→prod pipeline, per
  the confirmed scope decision.
- No stored/replayed build artifacts — a rollback rebuilds the target commit
  through the normal `build` job, it does not replay a saved `public/` from a
  past run.
- No manual "roll back to an arbitrary specific commit" input — `rollback`
  always means "the one previous version," full stop. Rolling back further
  than one step just means running `rollback` again once the first rollback
  itself is live (see §5's handling of that case).
- No new GitHub Environment / dedicated pre-deploy approval gate — confirmed
  scope decision was to reuse the existing qa/prod gates rather than add one.
- No changes to `tools/deploy.mjs` itself — the `--prune` flag already exists
  there; rollback is achieved by checking out a different commit before the
  existing build/deploy steps run.

## 3. `workflow_dispatch` inputs

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
    inputs:
      prune:
        description: "Pass --prune to all three deploy steps (deletes stale remote files the build no longer produces). Rare — only for FTP cleanup."
        type: boolean
        default: false
      rollback:
        description: "Redeploy the previous version instead of main's tip (auto-detected from deploy history). Rare — only for undoing a bad deploy."
        type: boolean
        default: false
```

Dispatching still uses the standard "Use workflow from" branch/tag selector at
the top of the Actions UI — that should stay `main` (it's what makes
`github.ref == 'refs/heads/main'`, the existing guard on every deploy job,
still hold).

Each deploy job's existing `if: github.ref == 'refs/heads/main' &&
github.event_name == 'push'` also gains `workflow_dispatch` as an accepted
trigger — without this, a manual dispatch would pass `php`/`tests`/`assets`/
`guard`/`build` but never actually reach any deploy job:

```yaml
if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
```

`pull_request` runs remain excluded, unchanged.

## 4. Determining "the previous version"

There's no existing deploy-history storage (`deployment.json` is overwritten
on every deploy — it only ever reflects the *current* state). The source of
truth used instead is `ci.yml`'s own run history: a run's overall conclusion
is `success` only once every job that actually ran completed successfully —
and for any `push`- or `workflow_dispatch`-triggered run on `main`,
`deploy-prod` always runs (per §3's `if:` condition) — so **a successful run
of this workflow on `main`, triggered by `push` or `workflow_dispatch`,
implies that run's commit really did reach PROD.** (`pull_request`-triggered
runs are explicitly excluded from this query — their `deploy-*` jobs are
always skipped, so a "successful" PR check run never implies a deploy.)

New job `rollback-plan` (runs only `if: inputs.rollback == true`):

1. Queries the GitHub Actions API (`gh run list --workflow=ci.yml
   --branch=main --status=success -L <n>`, using the run's own `GITHUB_TOKEN`
   with `actions: read` permission — a new permission this job needs, added
   only for it) for the most recent successful runs, filtered to
   `event == 'push' || event == 'workflow_dispatch'`, newest first.
2. **Current** = the first (most recent) run's commit SHA.
3. **Previous** = the first *later* run in that same list whose commit SHA
   differs from Current (skips over any consecutive runs that happen to share
   a commit — e.g. a `prune`-only dispatch against the same tip doesn't count
   as a distinct "version").
4. If fewer than two distinct commits are found, the job fails loudly
   ("No previous successful deploy found — nothing to roll back to") rather
   than deploying something unintended.
5. Prints a clear summary to `$GITHUB_STEP_SUMMARY` — for both Current and
   Previous: short SHA, commit subject, author date, and a link to the run
   that deployed it — and sets a `target_sha` job output to Previous's SHA.

**Repeated rollbacks:** if `rollback` is run again while a previous rollback
is the current live version, "Current" (from the algorithm above) is that
rollback's commit, and "Previous" naturally resolves to whatever was live
*before* it — the search walks back through real run history each time
rather than toggling between the same two commits.

## 5. Checkout: building the right commit

Every job that currently checks out the triggering commit implicitly now
needs the resolved target when a rollback is in progress. Since
`rollback-plan` only runs for `rollback` dispatches, downstream jobs depend on
it *and* tolerate it being skipped (the normal case):

```yaml
needs: [rollback-plan]   # added to php, tests, assets, guard, build
if: always() && (needs.rollback-plan.result == 'success' || needs.rollback-plan.result == 'skipped')
```

```yaml
- uses: actions/checkout@v5
  with:
    ref: ${{ needs.rollback-plan.outputs.target_sha || github.sha }}
```

On a normal `push`/PR run, `rollback-plan` is skipped, its output is empty,
and `ref` resolves to `github.sha` — identical to today. On a `rollback`
dispatch, every job — `php`, `tests`, `assets`, `guard`, `build`, and the
three `deploy-*` jobs — checks out and verifies the resolved previous commit,
not `main`'s tip. This is deliberate: a rollback re-runs the full quality-gate
pipeline against the old code rather than skipping straight to deploying it.

## 6. Prune passthrough

Each of the three `Deploy to <ENV> over FTP` steps changes from

```yaml
run: npm run deploy:test
```

to

```yaml
run: npm run deploy:test -- ${{ inputs.prune && '--prune' || '' }}
```

(and equivalently for `qa`/`prod`). On a `push`-triggered run, `inputs.prune`
is falsy, so the appended argument is an empty string — byte-for-byte the same
command as today. Only an explicit manual dispatch with the checkbox ticked
adds `--prune`, and `deploy.mjs`'s existing per-target path guard (refusing to
run unless `FTP_DIR` matches the target env name) still applies, so a mistyped
target still can't prune the wrong environment.

## 7. The "refuse stale commit" exception

`deploy-qa` and `deploy-prod` each have a guard step that fails the job if
`main` has advanced past the run's commit — it exists to stop an out-of-order
*approval* of a normal push run that a newer merge has since superseded. A
rollback is, by definition, not `main`'s tip, so this check must not fire for
it:

```yaml
- name: Refuse stale commit
  if: inputs.rollback != true
  run: |
    git fetch --quiet origin main
    tip=$(git rev-parse origin/main)
    if [ "$tip" != "$GITHUB_SHA" ]; then
      echo "::error::main has advanced to $tip but this run targets $GITHUB_SHA — refusing to deploy a stale commit. Approve the newer run instead."
      exit 1
    fi
    echo "Confirmed $GITHUB_SHA is the current tip of main."
```

The check stays fully active for every ordinary push-triggered run (and for a
plain manual dispatch with neither input set) — it's only skipped when a
rollback was explicitly requested.

## 8. Confirmation: reusing the qa/prod gates

Per the confirmed scope decision, there's no new dedicated approval gate.
Instead: `rollback-plan`'s summary (§4.5) is visible on the run page as soon
as it completes, well before `deploy-qa`'s or `deploy-prod`'s Required-
reviewers gate is reached — a maintainer approving those gates on a rollback
run can (and should) check that summary first to confirm Current/Previous are
what they expect, then approve or cancel the run. TEST has no gate today and
still doesn't for a rollback — it auto-deploys the resolved previous version
before anyone approves anything, consistent with TEST's existing "low-stakes,
always auto-deploys" role; QA and PROD, the environments that matter, remain
gated exactly as they are today.

## 9. Database migrations

No special-casing needed. `dbmigrate:<env>` (run as the existing post-deploy
step, unchanged) re-running against an older checkout's `sql/migrations/`
directory is a safe no-op: migrations are tracked in `schema_migrations` and
applied at-most-once, and per `sql/migrations/README.md`'s authoring rules
every migration is required to leave the app working against **both** the
pre- and post-migration schema. A rollback to older code never needs the
schema to move backward — the DB simply keeps whatever migrations were already
applied.

## 10. Safety properties preserved

- **Approval gates unchanged**: `qa`/`prod` still require their GitHub
  Environment's Required-reviewers approval for *every* run, rollback or not.
- **Same commit through all three environments**: both prune and rollback
  reuse the exact `needs: [...]` chain (`deploy-qa` needs `deploy-test`,
  `deploy-prod` needs `deploy-qa`) — no environment ever receives bytes that
  weren't verified and deployed to the environment before it in the same run.
- **`deployment.json`** naturally reflects the rolled-back commit SHA after a
  rollback run — no change needed there; it already records whatever commit
  the run actually deployed.
- **Config-shape drift check** in `deploy.mjs` runs unchanged for a rollback —
  if the older commit's `config.example.php` shape doesn't match the live
  server's `config.php`, the deploy still refuses with the same clear error it
  gives today.

## 11. Documentation

`CLAUDE.md`'s deployment section gains a short note next to the existing local
`--prune` documentation, describing both new capabilities and how to trigger
them (`gh workflow run ci.yml -f prune=true` / `-f rollback=true`, or the
Actions tab's "Run workflow" form), and framing them explicitly as rare,
maintainer-initiated actions. It calls out that `rollback` needs no other
input — check the `rollback-plan` job's summary on the run to see what it
resolved to before approving `qa`/`prod`.

## 12. Testing

This is a CI workflow configuration change — no unit test exercises it (no
`tests/` coverage for `.github/workflows/*.yml` exists in this project today).
Verification is manual, after merging:

1. A `workflow_dispatch` run with both inputs left `false` must behave
   identically to a normal push (smoke check that nothing regressed).
2. A manual run with `prune: true` only, confirming `--prune` reaches the
   deploy step and `deploy.mjs`'s existing dry-run/verify machinery behaves as
   documented.
3. A manual run with `rollback: true` after at least two real successful
   deploys exist in history, confirming `rollback-plan` correctly identifies
   Current/Previous, the summary is legible, checkout/build/deploy all target
   the resolved previous commit, and the stale-commit guard is skipped.
4. A manual run with `rollback: true` when fewer than two successful deploys
   exist in history (or run against a fresh fork), confirming `rollback-plan`
   fails loudly instead of deploying something unintended.
