# CI: Manual Deploy Dispatch — Prune Cleanup & Rollback — Design

**Date:** 2026-07-22
**Status:** Approved (pending spec review)
**Scope:** Filed from a conversation during issue #4 planning — not (yet) its own
GitHub issue. Adds a `workflow_dispatch` trigger to `.github/workflows/ci.yml`
with two independent, rarely-used inputs: `prune` (clean up stale remote FTP
files) and `deploy_ref` (redeploy an older commit — rollback). Both reuse the
existing test→qa→prod pipeline and its approval gates unchanged; neither adds a
new deploy code path.

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
   locally and running the deploy script by hand — same friction.

Both are rare, deliberate, maintainer-triggered actions — not something that
should ever happen from a routine merge to `main`.

## 2. Goals / Non-Goals

**Goals**

1. A `workflow_dispatch` trigger on `ci.yml`, runnable from the Actions tab or
   `gh workflow run`.
2. A `prune` boolean input: when true, passes `--prune` to all three
   `deploy:<env>` steps in that run.
3. A `deploy_ref` string input: when set, builds and deploys that commit SHA or
   tag instead of `main`'s tip — a rollback.
4. Both inputs are independent and optional; omitting both reproduces today's
   push-triggered behavior exactly.
5. Preserve every existing safety property: `php`/`tests`/`assets`/`guard`/
   `build` still gate the deploy jobs, and `qa`/`prod` still require their
   GitHub Environment's Required-reviewers approval.

**Non-Goals**

- No fast path that deploys to a single environment only (e.g. prod-only
  rollback) — both features go through the full test→qa→prod pipeline, per
  the confirmed scope decision below.
- No stored/replayed build artifacts — a rollback rebuilds the target commit
  through the normal `build` job, it does not replay a saved `public/` from a
  past run.
- No changes to `tools/deploy.mjs` itself — both flags already exist there
  (`--prune`) or are achieved by checking out a different commit before the
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
      deploy_ref:
        description: "Commit SHA or tag to build & deploy instead of main's tip (rollback). Leave empty for normal behavior."
        type: string
        default: ""
```

Dispatching still uses the standard "Use workflow from" branch/tag selector at
the top of the Actions UI — that should stay `main` (it's what makes
`github.ref == 'refs/heads/main'`, the existing guard on every deploy job,
still hold). `deploy_ref` is a separate, explicit input for *which commit gets
built and deployed*, so there's no ambiguity between "which ref runs the
workflow" and "which ref gets shipped."

Each deploy job's existing `if: github.ref == 'refs/heads/main' &&
github.event_name == 'push'` also gains `workflow_dispatch` as an accepted
trigger — without this, a manual dispatch would pass `php`/`tests`/`assets`/
`guard`/`build` but never actually reach any deploy job:

```yaml
if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
```

`pull_request` runs remain excluded, unchanged.

## 4. Checkout: building the right commit

Every job that currently does `uses: actions/checkout@v5` with no `ref:`
(implicitly checking out the triggering commit) changes to:

```yaml
- uses: actions/checkout@v5
  with:
    ref: ${{ inputs.deploy_ref || github.sha }}
```

On a normal `push` run, `inputs.deploy_ref` is empty/absent, so this resolves
to `github.sha` — identical to today. On a manual dispatch with `deploy_ref`
set, every job — `php`, `tests`, `assets`, `guard`, `build`, and the three
`deploy-*` jobs — checks out and verifies *that* commit, not `main`'s tip. This
is deliberate: a rollback should re-run the full quality-gate pipeline against
the old code, not skip straight to deploying it.

`deploy_ref` must be a full commit SHA or an existing tag reachable in the
repo's history — GitHub's default server config allows fetching an arbitrary
reachable SHA directly, which `actions/checkout` relies on here.

## 5. Prune passthrough

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

## 6. The "refuse stale commit" exception

`deploy-qa` and `deploy-prod` each have a guard step that fails the job if
`main` has advanced past the run's commit — it exists to stop an out-of-order
*approval* of a normal push run that a newer merge has since superseded. A
deliberate rollback via `deploy_ref` is, by definition, not `main`'s tip, so
this check must not fire for it:

```yaml
- name: Refuse stale commit
  if: inputs.deploy_ref == ''
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
plain manual dispatch with no `deploy_ref`) — it's only skipped when a rollback
was explicitly requested.

## 7. Database migrations

No special-casing needed. `dbmigrate:<env>` (run as the existing post-deploy
step, unchanged) re-running against an older checkout's `sql/migrations/`
directory is a safe no-op: migrations are tracked in `schema_migrations` and
applied at-most-once, and per `sql/migrations/README.md`'s authoring rules
every migration is required to leave the app working against **both** the
pre- and post-migration schema. A rollback to older code never needs the
schema to move backward — the DB simply keeps whatever migrations were already
applied.

## 8. Safety properties preserved

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

## 9. Documentation

`CLAUDE.md`'s deployment section gains a short note next to the existing local
`--prune` documentation, describing both new capabilities and how to trigger
them (`gh workflow run ci.yml -f prune=true` / `-f deploy_ref=<sha>`, or the
Actions tab's "Run workflow" form), and framing them explicitly as rare,
maintainer-initiated actions.

## 10. Testing

This is a CI workflow configuration change — no unit test exercises it (no
`tests/` coverage for `.github/workflows/*.yml` exists in this project today).
Verification is manual, after merging: a `workflow_dispatch` run against `main`
with both inputs left empty must behave identically to a normal push (smoke
check that nothing regressed), followed by one deliberate manual run with
`prune: true` only (confirms `--prune` reaches the deploy step and the
existing dry-run/verify machinery in `deploy.mjs` still behaves as documented)
and, separately, one with `deploy_ref` set to a known older commit on TEST
(confirms checkout, build, and deploy all correctly target the older commit
and the stale-commit guard is skipped).
