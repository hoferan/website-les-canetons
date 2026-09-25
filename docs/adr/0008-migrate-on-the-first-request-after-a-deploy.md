# 0008. Migrate on the server, on the first request after a deploy

Status: Accepted, 2026-07-20

## Context

The database cannot be reached from outside the host. Its user is granted only to the
host's internal servers, and a remote login fails with `ERROR 1045`. The host also
firewalls GitHub's runners: an HTTPS request from a runner to the site times out, and
the control panel has no allowlist to change that. There is no shell and no cron.

Deployed code is not compatible with the schema it replaces, so there must be no gap
between a deploy and its migration.

## Decision

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

Rejected: a CI step calling `/api/migrate` (the runner is firewalled), a remote
database connection (refused), a server cron (there is none, and it leaves a window),
and replacing the middleware with a deliberate call before every deploy, which was
proposed at the start of the rebuild in September 2026 and not carried out.

## Consequences

A migration that fails takes the API down. Every `/api/*` request answers 503
`service_unavailable` and the migration retries on every request.

A long `ALTER` holds a PHP-FPM worker with no timeout of its own and can hit
`max_execution_time`, leaving a half-applied schema. Anything non-trivial goes through
`npm run dbmigrate:<env>` first.

The first visitor after a deploy pays for the migration.

`AUTO_MIGRATE=false` does not fail closed: the server serves against whatever schema it
has. Whether the code or the documentation should change is issue #112.

Reference data (registers, roles, committee seats) is seeded by migrations too, because
there is no shell to run a seeder with (ADR 0014).
