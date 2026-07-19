# Database migrations

Incremental schema changes, applied **automatically** after each deploy in ascending
numeric order. `docker/db/init/01-schema.sql` is the dev baseline (existing tables);
every change *after* that baseline lives here as a numbered file — this directory is
the single source of truth for those changes.

## Naming

`NNN_short_description.sql` — zero-padded, monotonically increasing (`001_…`, `002_…`).

## How migrations are applied

- **Local dev:** the docker `migrate` service runs `tools/migrate.php` (→ `App\Migrator`) on every `docker compose up`.
- **TEST / QA / PROD:** applied **server-side** over HTTPS after each deploy, via
  the token-gated `POST /api/migrate` endpoint, triggered by
  `npm run dbmigrate:<env>` (and the CI deploy jobs). Remote DB login from
  CI/local is blocked by the host, so migrations run on the server where
  localhost DB access works. A failed migration fails the deploy.
- PROD reports pending migrations (`dbmigrate:prod --dry-run`) before applying,
  within the manual prod approval gate.

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

`docker compose up` runs a one-shot `migrate` service that applies every
not-yet-applied migration in this directory, in ascending order, and records
each in a `schema_migrations` table. It is **idempotent** — re-running applies
nothing new — and runs on every `up`, so a plain `docker compose up` picks up
new migrations without needing `docker compose down -v`. The `web` service waits
for `migrate` to finish before serving.

`docker/db/init/01-schema.sql` / `02-seed.sql` remain the fresh-volume baseline
(existing tables + synthetic seed); the runner applies the numbered migrations
on top.
