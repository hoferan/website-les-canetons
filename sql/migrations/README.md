# Database migrations

Incremental schema changes, applied **automatically** after each deploy in ascending
numeric order. `docker/db/init/01-schema.sql` is the dev baseline (existing tables);
every change *after* that baseline lives here as a numbered file — this directory is
the single source of truth for those changes.

## Naming

`NNN_short_description.sql` — zero-padded, monotonically increasing (`001_…`, `002_…`).

## How migrations are applied

- **Local dev:** the `web` container's entrypoint (`docker/web/entrypoint.sh`) runs
  `tools/migrate.php` (→ `App\Migrator`) against the old app's SQL migrations first,
  then `php artisan migrate --force` for Laravel's own (whose guarded migrations
  adopt some of the old app's tables in place — which is why the ordering
  matters). `App\AutoMigrator` still runs on the old app's first request
  afterward, same as production, but finds nothing pending since the entrypoint
  already applied everything.
- **TEST / QA / PROD:** applied **server-side** over HTTPS after each deploy, via
  the token-gated `POST /api/migrate` endpoint, triggered by
  `npm run dbmigrate:<env>`. Remote DB login from CI/local is blocked by the
  host, so migrations run on the server where localhost DB access works. A
  failed migration fails the deploy.
- **CI:** each deploy job (`deploy-test` / `deploy-qa` / `deploy-prod` in
  `ci.yml`) applies migrations as a step after the upload. PROD first runs
  `dbmigrate:prod --dry-run` (reports the pending list in the job log), then
  applies — both inside the manually-approved prod job. TEST/QA also send the
  staging Basic Auth credentials; PROD has none.

## Authoring rules (required)

Migrations MUST be safe to fail and safe to re-run — the app must keep working
even if a migration fails (MariaDB cannot roll back DDL):

- **Idempotent:** `CREATE TABLE IF NOT EXISTS`, `DROP ... IF EXISTS`,
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **One logical change per file**, a single statement where practical.
- **Expand-contract** for renames/removals:
  - Rename → add the new column, deploy code using it, drop the old column in a
    *later* release.
  - Remove → deploy code that stops using the column first; drop it in a *later*
    release.
- Each migration must leave the app working with **both** the pre- and
  post-migration schema.

## Local dev

The `web` container's entrypoint (`docker/web/entrypoint.sh`) applies every
not-yet-applied migration in this directory, in ascending order, recording each
in a `schema_migrations` table, before Apache/PHP-FPM start serving requests.
It runs `tools/migrate.php` (the old app's SQL migrations) FIRST, then
`php artisan migrate --force` (Laravel's own) — Laravel's guarded migrations
adopt some of the old app's tables in place (add `updated_at`, convert the
`used_challenges` primary key), so they must run against tables that already
exist. It is **idempotent** — re-running applies nothing new — and runs on
every `npm run dev`, so new migrations are picked up without a volume reset.
`App\AutoMigrator` (`auto_migrate => true` in `config/config.docker.php`) still
runs on the old app's first request afterward, exactly as production does, but
finds nothing pending since the entrypoint already applied everything.

`docker/db/init/01-schema.sql` / `02-seed.sql` remain the fresh-volume baseline
(existing tables + synthetic seed); the entrypoint applies the numbered
migrations on top.
