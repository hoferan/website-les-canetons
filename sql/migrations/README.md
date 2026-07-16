# Database migrations

Incremental schema changes, applied **manually on production** in ascending numeric
order. `docker/db/init/01-schema.sql` is the dev baseline (existing tables); every
change *after* that baseline lives here as a numbered file — this directory is the
single source of truth for those changes.

## Naming

`NNN_short_description.sql` — zero-padded, monotonically increasing (`001_…`, `002_…`).

## Applying on production (manual)

1. Open the prod DB (Adminer / phpMyAdmin).
2. Run each not-yet-applied migration **in ascending order**, once each.
3. Record which files you ran (they are not idempotent — do not re-run).

## Local dev

Fresh dev volumes apply these automatically: each migration is mounted into the
MariaDB init dir in `docker-compose.yml` (after `01-schema.sql` / `02-seed.sql`).
When you add a new migration, add a matching mount line there too. To re-bootstrap:
`docker compose down -v && docker compose up -d --build`.
