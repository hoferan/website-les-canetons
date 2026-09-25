---
status: accepted
date: 2026-07-20
decision-makers: André Hofer
---

# Migrate on the server, on the first request after a deploy

## Context and Problem Statement

The database cannot be reached from outside the host. Its user is granted only to the
host's internal servers, and a remote login fails with `ERROR 1045`. The host also
firewalls GitHub's runners: an HTTPS request from a runner to the site times out, and
the control panel has no allowlist to change that. There is no shell and no cron.

Deployed code is not compatible with the schema it replaces, so there must be no gap
between a deploy and its migration. What applies the migrations?

## Considered Options

- Run pending migrations from middleware, on the first request after a deploy
- A CI step that calls `/api/migrate` after the upload
- Connect to the database from CI and migrate remotely
- A cron job on the server
- A deliberate manual call before every deploy, with no automatic path

## Decision Outcome

Chosen option: "Run pending migrations from middleware", because it is the only
option the host allows that leaves no gap between the deploy and the migration.

`App\Http\Middleware\RunPendingMigrations` is prepended to Laravel's `api` and `web`
middleware groups. `web` matters because the SPA's first call, `GET
/sanctum/csrf-cookie`, needs the `sessions` table. On each request it checks for
pending migrations, uncached, because an FTP deploy has no way to invalidate a cache.
If any are pending it takes `GET_LOCK('lescanetons_migrate')`, checks again under the
lock, and runs `migrate --force`.

The lock is a raw MySQL advisory lock. `Cache::lock()` and `migrate --isolated` both go
through the `database` cache store, whose table is itself created by a migration.

`AUTO_MIGRATE` in each server's `.env` switches this off, and defaults to on.

`POST /api/migrate`, with its secret in the `X-Migrate-Token` header, stays as the
manual path: `npm run dbmigrate:<env>` for a dry run, or to apply a heavy migration
before the deploy that needs it.

Every migration must be idempotent and backward compatible. MariaDB commits DDL
implicitly, so a failed migration cannot be rolled back.

### Consequences

- Good, because a merge that deploys TEST also migrates it, with nobody involved.
- Good, because concurrent PHP-FPM workers cannot apply the same migration twice.
- Bad, because a migration that fails takes the API down. Every `/api/*` request
  answers 503 `service_unavailable`, and the migration retries on every request.
- Bad, because a long `ALTER` holds a PHP-FPM worker with no timeout of its own and
  can hit `max_execution_time`, leaving a half-applied schema. Anything non-trivial
  goes through `npm run dbmigrate:<env>` first.
- Bad, because the first visitor after a deploy pays for the migration.
- Bad, because `AUTO_MIGRATE=false` does not fail closed: the server serves against
  whatever schema it has. Whether the code or the documentation should change is issue
  #112.

## Pros and Cons of the Options

### A CI step that calls `/api/migrate`

- Bad, because the runner is firewalled and its request never arrives.

### Connect to the database from CI

- Bad, because the host refuses the login.

### A cron job on the server

- Bad, because the host has none, and it would leave a window between deploy and
  migration.

### A deliberate manual call before every deploy

It was proposed at the start of the rebuild in September 2026 and not carried out.

- Good, because nothing runs on the request path.
- Bad, because a merge auto-deploys TEST, so a forgotten call leaves new code on an old
  schema.

## More Information

Reference data (registers, roles, committee seats) is seeded by migrations too, because
there is no shell to run a seeder with ([ADR-0014](0014-authorize-by-permission-never-by-role.md)).
