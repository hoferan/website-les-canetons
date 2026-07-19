# Design: QA deploy pipeline + staging-config sensitive-data redaction

**Date:** 2026-07-19

Two related changes to the deployment story, done together because they touch
the same files (`.env.example`, `staging/`, deploy tooling, CI, docs).

## 1. Goals

**Part A — QA deploy.** Add the ability to deploy to the QA staging site:

- A local `npm run deploy:qa` task, mirroring `deploy:test`.
- A CI workflow that deploys to QA **manually only** (`workflow_dispatch`) and
  promotes the **exact commit of the latest successful TEST deploy** — i.e. build
  once, promote the tested bytes. "Only if TEST succeeded" falls out for free:
  if there is no successful TEST deploy, there is no commit to promote.
- A follow-up (separate GitHub issue, not built here): auto-promote QA after e2e
  tests pass on TEST.

**Part B — sensitive-data redaction.** Remove hosting-internal identifiers from
tracked files, working tree only (no git-history rewrite; no live credentials
were ever committed — `.env`, `config.php`, `.htpasswd` are git-ignored).

## 2. Non-goals

- No git-history rewrite.
- No change to the prod deploy (stays a manual WinSCP promotion).
- No redaction of public-facing site content — the committee email
  `comite@lescanetons.org` and the member name/phone numbers in `app/pages/*`
  are published on the live site on purpose and stay.
- The provider name `easy-hebergement` stays (explicitly kept).
- The e2e-triggered auto-QA-deploy is only filed as an issue.

## 3. Part A — QA deploy

### 3.1 Local: one parameterized deploy script

`git mv tools/deploy-test.mjs tools/deploy.mjs`; it takes a required target arg
`node tools/deploy.mjs <test|qa>`. A small config table maps target → dir var +
safety guard:

| target | dir env var    | path guard (case-insensitive, must match) |
| ------ | -------------- | ------------------------------------------ |
| `test` | `FTP_TEST_DIR` | `/(^\|[/.])test([/.]\|$)/`                  |
| `qa`   | `FTP_QA_DIR`   | `/(^\|[/.])qa([/.]\|$)/`                    |

Everything else is unchanged from today's `deploy-test.mjs`: reads
`FTP_HOST`/`FTP_USER`/`FTP_PASS` + the target's dir var, walks `public/`, uploads
only new/changed files, never uploads or prunes the protected server-owned files,
supports `--dry-run`/`--prune`/`--force`. The guard still hard-refuses a target
dir that does not clearly point at the intended env (so a mistyped path can never
hit prod). Console labels become generic (`<TARGET> deploy`). A missing/invalid
target arg errors with the valid list.

`package.json`:

- `deploy:test` → `npm run build && node tools/deploy.mjs test` (behaviour
  identical to today; the CI job calls the npm script name, so it is unaffected)
- `deploy:qa` → `npm run build && node tools/deploy.mjs qa`

### 3.2 CI: `.github/workflows/deploy-qa.yml` (new, separate workflow)

- Trigger: **`workflow_dispatch` only** (manual "Run workflow" button).
- `permissions: { contents: read, actions: read }`.
- One job `deploy-qa`: `environment: qa`,
  `concurrency: { group: deploy-qa, cancel-in-progress: false }`.
- Steps:
  1. **Resolve the promote SHA** with the repo `GITHUB_TOKEN`:
     `gh run list --workflow=ci.yml --branch=main --event=push --status=success --limit=1 --json headSha --jq '.[0].headSha'`.
     Empty result → print "no successful TEST deploy to promote" and `exit 1`.
  2. `actions/checkout@v4` with `ref: <sha>` (that commit is on `main`, so
     available).
  3. `actions/setup-node@v4` (node 20) + `npm ci`.
  4. `npm run deploy:qa` (builds `public/` from the checked-out commit, then FTP
     uploads to QA), with `FTP_HOST`/`FTP_USER`/`FTP_PASS`/`FTP_QA_DIR` from the
     `qa`-environment secrets.

Rationale for a separate workflow (vs. a job in `ci.yml`): a manual promotion
deserves its own "Run workflow" button and its own environment gate, and keeps
`ci.yml` focused on validate + auto-TEST.

### 3.3 Secrets (set once, by hand — cannot be automated here)

Create a **`qa` GitHub Environment** with `FTP_HOST`, `FTP_USER`, `FTP_PASS`,
`FTP_QA_DIR` (optionally a required-reviewer protection rule for an extra gate).
Documented in `staging/README.md` and CLAUDE.md.

### 3.4 Follow-up issue

Create a GitHub issue "**ci: auto-deploy to QA after e2e tests pass on TEST**",
referencing **#14** (Playwright e2e coverage) as a dependency, describing the
`deploy-qa.yml` workflow as the reusable building block to trigger automatically
once e2e passes against TEST.

## 4. Part B — sensitive-data redaction

### 4.1 Replacement rules

| Token | Action |
| ----- | ------ |
| hosting account name `<account>` | replace with placeholder `<account>` |
| absolute path `/absolute/server/path/to/...` | genericize (see 4.2 for the functional `.htaccess` case; prose → `/absolute/server/path/to/<host>/.htpasswd`) |
| staging hostnames `<test-host>` / `<qa-host>` (incl. `https://`) | `<test-host>` / `<qa-host>` |
| provider `easy-hebergement(.net)` | **keep** |
| `comite@lescanetons.org`, member names/phones in `app/pages/*` | **keep** |
| Docker container path `/var/www/html`, dev DB creds `canetons`, DB names | **keep** (stock image path / throwaway dev values) |

### 4.2 `AuthUserFile` path — functional substitution

The `AuthUserFile` directive in `staging/{test,qa}/.htaccess` needs the real
absolute server path, so it cannot become prose. Mechanism:

- In the tracked `staging/{test,qa}/.htaccess`, replace the literal path with the
  token `__HTPASSWD_PATH__`.
- `tools/build-overlays.mjs` substitutes `__HTPASSWD_PATH__` with
  `HTPASSWD_PATH_TEST` / `HTPASSWD_PATH_QA` read from the git-ignored `.env`.
- The `.env` loader currently living in `deploy-test.mjs` is extracted into a
  tiny shared `tools/dotenv.mjs` and reused by both `deploy.mjs` and
  `build-overlays.mjs` (no duplication).
- If the var is unset when building that overlay, emit the token unchanged and
  print a warning — dev builds still work and the gap is visible, rather than
  hard-failing.
- `.env.example` documents `HTPASSWD_PATH_TEST` / `HTPASSWD_PATH_QA` with generic
  placeholder paths.

### 4.3 Living files touched

- `.env.example` — generic `FTP_TEST_DIR`/`FTP_QA_DIR` examples (no account name,
  no real host), add `HTPASSWD_PATH_TEST`/`_QA`, header mentions both
  `deploy:test` and `deploy:qa`.
- `staging/README.md` — genericize hostnames and the absolute path; document the
  `__HTPASSWD_PATH__` mechanism and the `qa` GitHub Environment setup.
- `staging/{test,qa}/.htaccess` — `__HTPASSWD_PATH__` token; genericized hostname
  in the top comment.
- CLAUDE.md — add `deploy:qa` + the manual QA-promotion flow to the deploy
  section; no path/account redaction needed there (only `easy-hebergement`, kept,
  and `/var/www/html`, kept).

### 4.4 Historical docs (`docs/superpowers/`)

Apply the same replacement rules (account name, absolute paths, staging
hostnames) across the dated specs/plans. Keep `easy-hebergement`, and keep the
committee PII that appears in the `comite-teamdirection` docs (per the keep
rules). This intentionally edits dated records, accepted here to remove the
sensitive strings.

### 4.5 Redaction verification

Re-run the discovery greps and assert **zero** matches across tracked files
(excluding `vendor/`, `package-lock.json`, `composer.lock`) for:
`<account>`, `<abs-server-path>`, `<test-host>`, `<qa-host>`.
`easy-hebergement` and the `app/pages/*` PII are expected to remain.

## 5. Testing

- `deploy.mjs`: `npm run deploy:qa -- --dry-run` shows the plan; the guard
  rejects an `FTP_QA_DIR` that does not contain `qa`. (Deploy proper hits FTP, so
  it is exercised manually — there is no JS test harness in this repo.)
- `build-overlays.mjs`: `npm run build:overlay` with and without
  `HTPASSWD_PATH_*` set — confirm token substitution and the warning path.
- Redaction: the grep assertions in 4.5.
- `npm run check` stays green on the renamed/added JS.
- `deploy-qa.yml`: YAML validity + the `gh run list` query shape (full run needs
  the `qa` secrets, so it is verified on first manual dispatch).

## 6. Ordering

1. Redaction + `__HTPASSWD_PATH__` substitution (`staging/`, `build-overlays.mjs`,
   shared `dotenv.mjs`, `.env.example`).
2. `deploy.mjs` refactor + `deploy:qa` npm script.
3. `deploy-qa.yml`.
4. Docs (CLAUDE.md, `staging/README.md`).
5. Historical-doc redaction sweep + grep verification.
6. File the follow-up GitHub issue.
7. **Manual, by maintainer:** create the `qa` GitHub Environment secrets and set
   `HTPASSWD_PATH_*` in local `.env`.
