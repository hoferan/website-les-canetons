# Automated DB migrations for deployments

**Date:** 2026-07-19
**Status:** Approved (design)

## Problem

Schema migrations (`sql/migrations/NNN_*.sql`) are applied **by hand** on
production today (open Adminer/phpMyAdmin, run each pending file). That is
error-prone and blocks fully automated deployments: a deploy can ship code that
expects a schema change nobody applied yet.

We want migrations to run automatically as part of the deploy pipeline
(TEST → QA → PROD), for a small single-maintainer club website with low traffic.

## Feasibility finding (PoC) — why the mechanism is server-side

A PoC fetched the TEST server's `config.php` over FTP and probed its DB:

- `db.host` is `sql1.cluster1.easy-hebergement.net` (a dedicated remote SQL
  host), and TCP `:3306` is reachable from outside.
- **But** an authenticated `SELECT` from our external IP returns
  `ERROR 1045: Access denied for user '…'@'<our-ip>'` — the DB user is granted
  only for the hosting's internal servers, **not arbitrary external IPs**.

So connecting **remotely** from CI/local to run migrations is not possible
(CI IPs are dynamic and un-allowlistable; even a fixed local IP is denied).
Migrations must run **on the server**, where localhost DB access works.

## Goals

1. Migrations run **server-side**, triggered over HTTPS as a **post-deploy
   step**, per environment, from the CI pipeline (and runnable locally).
2. **No DB credentials leave the server** — the runner reuses `config.php`'s
   existing localhost DB connection.
3. A **single implementation** of migration logic, shared by the HTTP endpoint
   and the local/docker dev runner.
4. **Idempotent, re-runnable, backward-compatible** migrations (expand-contract),
   so the app keeps working even if a migration fails.
5. A migration failure **fails the deploy loudly** (non-zero exit / red CI job);
   manual cleanup is acceptable.
6. **PROD safety:** report pending migrations (dry-run) before applying, within
   the existing manual prod approval gate.

## Non-goals

- **Remote DB connections** from CI/local (proven infeasible above).
- **Atomic rollback of DDL.** MariaDB implicitly commits on `CREATE/ALTER/DROP`
  (confirmed against MariaDB's START TRANSACTION and ROLLBACK docs), so schema
  changes cannot be rolled back inside a transaction. We get safety via
  idempotent, backward-compatible migrations instead (see Migration rules).
- **Migrate-gates-deploy ordering.** Because migrations are backward-compatible,
  the app tolerates both pre- and post-migration schema; we use the simple
  order (deploy → migrate → fail loudly) rather than a two-phase upload.
- **A new `.htaccess` rule to hide migrations** — the existing front-controller
  catch-all already makes any non-`/assets/` path a 404 unless it's a route.
- Rollback/backup of the filesystem deploy (separate concern).

## Architecture

```
CI/local (post-deploy)                     Server (localhost DB access works)
 tools/dbmigrate.mjs  ──HTTPS POST──►  POST /api/migrate      (token-gated)
  token + mode(dry-run|apply)               │ App\Migrator + App\Database::get()
  reads .env.<env> / CI secrets             │ applies public/sql/migrations/*.sql
  non-zero exit on failure  ◄──JSON────      └ {mode, applied[], pending[], status}
```

### Components

**1. `App\Migrator` (`app/src/Migrator.php`) — single source of logic.**
Constructor takes an open `mysqli` connection. Methods:
- `pending(string $dir): string[]` — **read-only**. Returns pending migration
  versions (filenames) in ascending order. If `schema_migrations` does not
  exist, treats applied-set as empty and **does not create the table** (dry-run
  must not write).
- `migrate(string $dir): string[]` — ensures `schema_migrations` exists, then
  for each pending file in order: `START TRANSACTION` → execute the file's
  statements → `INSERT` the version row → `COMMIT`. On any error: `ROLLBACK`,
  stop immediately, throw. Returns the versions applied this run.

The existing multi-statement apply logic (from `tools/migrate.php`) moves here,
wrapped per-file in a transaction. Bookkeeping (`schema_migrations` row) commits
with the change, so a failed migration is **never recorded as applied**.
(DDL implicit-commit caveat is documented, not code-solvable — see rules.)

**2. `POST /api/migrate` (`app/api/migrate.php`) — token-gated HTTP endpoint.**
- Registered in `app/src/routes.php` by adding `'migrate'` to the base `$apis`
  array (unconditional — not behind the `souper_signup` flag).
- Does its **own token auth** (does not use session `Auth`): reads the expected
  token from `config.php` (`migrate.token`), compares the request-supplied token
  with `hash_equals` (constant time). Token supplied via an `X-Migrate-Token`
  request header.
- **Disabled when `migrate.token` is empty/unset** → `404` (an unconfigured
  server cannot be triggered).
- **POST only** (else `405`).
- Mode from request (`?mode=dry-run` | `?mode=apply`, default `dry-run` for
  safety): dry-run calls `pending()`; apply calls `migrate()`.
- Uses `App\Database::get()` for the connection and
  `__DIR__ . '/../sql/migrations'` for the directory (i.e. docroot
  `sql/migrations`, shipped by the build).
- Returns JSON: `{ mode, environment, applied: [...], pending: [...], status }`
  with HTTP `200` on success, `500` on migration failure (with the failing
  version + error message).

**3. `tools/migrate.php` — thin CLI wrapper (local/docker dev).**
Reduced to: read DB creds from env (as today), `require` the `App\Migrator`
class file directly, construct it, call `migrate()`. No duplicated logic. The
docker `migrate` service (`docker-compose.yml`) additionally mounts `./app/src`
so the class file is available; its command is unchanged in spirit.

**4. `tools/dbmigrate.mjs` + npm scripts — the HTTPS trigger.**
- `npm run dbmigrate:test | dbmigrate:qa | dbmigrate:prod`.
- Loads `.env.<target>` then `.env` (see Config layout), reads `SITE_URL` and
  `MIGRATE_TOKEN` for the target; `POST`s to `${SITE_URL}/api/migrate`.
- Flags: `--dry-run` (mode=dry-run, prints the pending list, changes nothing).
- Prints the JSON result; **exits non-zero** on a non-2xx response or a
  `status != ok`.
- Hard target guard mirroring `deploy.mjs`: refuses to run unless the resolved
  config is for the named env.

**5. Build/deploy — ship the migration SQL.**
- `tools/build.mjs` copies `sql/migrations/**` into `public/sql/migrations/`.
- No new `.htaccess` rule: the front-controller catch-all already 404s any
  non-`/assets/`, non-route path, so `sql/migrations/*.sql` is unreachable over
  HTTP (same as `pages/`, `api/`, `src/`). The spec's acceptance includes
  verifying a direct GET of a migration file returns 404 on TEST.

**6. Config — `migrate.token`.**
- New key group in `config.example.php`:
  `'migrate' => ['token' => 'CHANGE_ME']`.
- Because the deploy config-shape pre-flight enforces key parity, **each
  server's `config.php` must gain `migrate.token` (by hand) before its next
  deploy** — intended safety, matching the `features.souper_signup` precedent.
- The token value is server-owned; it is never logged (pre-flight compares key
  shape only).

**7. `.env` refactor (separate commit).**
- `.env` — shared secrets only: `FTP_HOST`, `FTP_USER`, `FTP_PASS`.
- `.env.test` / `.env.qa` / `.env.prod` — per-env. To minimize churn, these keep
  the **existing suffixed keys** `deploy.mjs` already reads (`FTP_TEST_DIR` /
  `FTP_QA_DIR` / `FTP_PROD_DIR`, `HTPASSWD_PATH_TEST` / `HTPASSWD_PATH_QA`) so
  `deploy.mjs`'s per-target guard is **unchanged**, and add two unsuffixed keys
  used by the migrate trigger: `MIGRATE_TOKEN` and `SITE_URL`. (Each env file
  holds only its own env's values, so the unsuffixed names never collide.)
- `tools/dotenv.mjs` already accepts a filename; tooling loads `.env.<target>`
  first, then `.env` (env-specific wins; shared fills in). `deploy.mjs` and
  `dbmigrate.mjs` both use this layered load.
- `.env.example` documents shared keys; `.env.<env>.example` (or a documented
  block) documents per-env keys. In CI these are GitHub Environment secrets,
  not files.

### Deploy ordering (simple)

`deploy.mjs` (and the CI deploy jobs) run, per target:

1. Build + config-shape pre-flight (existing).
2. Upload artifact + post-deploy verification (existing feature).
3. **Trigger migration** via the `dbmigrate:<target>` step:
   - TEST / QA: `apply` directly.
   - PROD: `dry-run` first (report pending, surfaced at the approval gate),
     then `apply`.
4. A migration failure → non-zero exit → the deploy is marked failed. The app
   stays up (backward-compatible migrations); the maintainer cleans up by hand.

Per the maintainer's preference, `dbmigrate:<env>` is a **separate script the
deploy depends on** (deploy runs it after upload), not inlined into the upload
loop.

## Migration authoring rules (documented in `sql/migrations/README.md`)

Migrations MUST be safe to fail and safe to re-run:

- **Idempotent / re-runnable:** `CREATE TABLE IF NOT EXISTS`,
  `DROP … IF EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
- **One logical change per file**, a single statement where practical (a lone
  DDL statement is itself atomic).
- **Expand-contract for renames/removals:**
  - Rename a column → add the new column (migration), deploy code using it,
    drop the old column in a *later* release.
  - Remove a column → deploy code that stops using it first; drop the column in
    a *later* release.
- **Every migration keeps the app working with both the pre- and
  post-migration schema.** This — not DDL rollback — is the safety guarantee.

## Security

- Token-gated, `hash_equals` constant-time compare; token from server
  `config.php`, never in the artifact or CI logs.
- Endpoint disabled unless a non-empty token is configured.
- On TEST/QA the migrate route is **excluded from HTTP Basic Auth** (`.htaccess`
  overlay in `staging/`), so token is the sole gate there; PROD has no Basic
  Auth.
- Endpoint only ever runs the **committed** `sql/migrations/*.sql` present on the
  server — never SQL from the request body.
- POST only; migration files unreachable via direct HTTP (front-controller
  catch-all).

## Testing

- **`App\Migrator` — PHPUnit integration tests** (repo has `IntegrationTestCase`
  against `lescanetons_test`, each test in a rolled-back transaction where
  applicable):
  - `pending()` lists not-yet-applied files in ascending order.
  - `pending()` returns all files (and does **not** create the table) when
    `schema_migrations` is absent.
  - `migrate()` applies pending files, records them, and returns the applied
    list.
  - Re-running `migrate()` applies nothing (idempotent at the ledger level).
  - A failing migration throws, is **not** recorded, and stops the run
    (later files untouched).
- **Endpoint / trigger** — exercised end-to-end against the real TEST
  environment as Phase 1 acceptance (auth rejects a bad token; dry-run reports
  pending; apply applies and is idempotent; direct GET of a `.sql` file 404s).

## Phasing

- **Phase 1 — TEST end-to-end:** `App\Migrator` (+ tests), `/api/migrate`,
  `tools/migrate.php` refactor + docker mount, ship migrations in build,
  `migrate.token` config key, `tools/dbmigrate.mjs` + `dbmigrate:test`, wire
  into `deploy:test` and CI `deploy-test`. Prove against the real TEST DB.
- **Phase 2 — QA + PROD:** extend to `dbmigrate:qa` / `dbmigrate:prod` and the
  CI `deploy-qa` / `deploy-prod` jobs, with the PROD dry-run→apply flow.
- **`.env` refactor:** its own commit (can land within Phase 1, before the
  trigger needs per-env config).

## Files touched

- Create: `app/src/Migrator.php`, `app/api/migrate.php`, `tools/dbmigrate.mjs`,
  `tests/Integration/MigratorTest.php`, `.env.test.example` (+ qa/prod).
- Modify: `app/src/routes.php` (add `migrate` API route), `tools/migrate.php`
  (thin wrapper), `docker-compose.yml` (mount `app/src` in `migrate` service),
  `tools/build.mjs` (ship `sql/migrations/`), `config/config.example.php`
  (`migrate.token`), `config/config.docker.php` (token for local),
  `tools/deploy.mjs` (+ `dotenv` layered load), `package.json` (`dbmigrate:*`
  scripts), `.github/workflows/ci.yml` (migrate steps), `.env.example`,
  `sql/migrations/README.md` (authoring rules), `CLAUDE.md`,
  `staging/README.md` + staging `.htaccess` overlay (Basic Auth exception for
  the migrate route).
