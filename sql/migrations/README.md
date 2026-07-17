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

`docker compose up` runs a one-shot `migrate` service that applies every
not-yet-applied migration in this directory, in ascending order, and records
each in a `schema_migrations` table. It is **idempotent** — re-running applies
nothing new — and runs on every `up`, so a plain `docker compose up` picks up
new migrations without needing `docker compose down -v`. The `web` service waits
for `migrate` to finish before serving.

`docker/db/init/01-schema.sql` / `02-seed.sql` remain the fresh-volume baseline
(existing tables + synthetic seed); the runner applies the numbered migrations
on top.
