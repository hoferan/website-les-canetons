# Request-path auto-migration

**Date:** 2026-07-20
**Status:** Approved (design)

## Problem

DB migrations are applied by a post-deploy step that triggers the server-side
`POST /api/migrate` endpoint over HTTPS (`tools/dbmigrate.mjs`, run from CI or
locally). In CI this **fails**: the GitHub Actions runner cannot reach the
easy-hebergement TEST/QA web host — the connection to `:443` times out
(`UND_ERR_CONNECT_TIMEOUT`), i.e. the host silently drops the runner's
datacenter IP at the network firewall. The same trigger succeeds from a local
(allowlisted) machine, confirming the block is IP-based, below HTTP (not Basic
Auth, not `.htaccess`, not TLS, not `SITE_URL`).

The hosting control panel exposes only **DNS** (nameservers, A/CNAME records) —
no inbound firewall / IP-allowlist. So there is no way to let the runner (or a
proxy) reach the host, and a CI→host migration trigger cannot be made to work.

## Decision

Apply migrations **server-side, triggered by the application itself** on the
first request after a deploy. Because this runs on the host — where the DB
connection is local and permitted — it needs no inbound connection from CI and
is immune to the firewall. It also closes the deploy→migrate **ordering window**:
the new code's required schema is applied *before* the request that needs it is
served (the project's code is not backward-compatible with the pre-migration
schema — e.g. `ChallengeRepository` requires `used_challenges`).

Chosen over a server-side cron (the other no-inbound option) because cron leaves
a timing window (up to the interval) where new code meets old schema and 500s.

## Goals

1. Pending migrations are applied automatically, server-side, with no inbound
   connection from CI — on **all** environments (dev/test/qa/prod).
2. **Single-flight:** concurrent requests after a deploy never double-apply,
   deadlock, or serve against a half-migrated schema.
3. **Fail-loud:** a migration error yields HTTP 503 (never a page rendered
   against inconsistent schema).
4. **Cheap hot path:** when nothing is pending (the overwhelming majority of
   requests) the per-request cost is one light check and no lock.
5. **Per-server opt-out:** a config flag (default **on**) lets a server fall
   back to manual migration if auto-migrate ever misbehaves.
6. Reuse the existing `App\Migrator`; keep `/api/migrate` + `tools/dbmigrate.mjs`
   for manual **dry-run/inspection** and as a fallback.

## Non-goals

- **No CI→host migration trigger.** Removed from `ci.yml` (unreachable host).
- **No cron.** Rejected in favour of request-path for the ordering guarantee.
- **No allowlist / proxy / self-hosted runner.** The host offers no inbound
  IP-allow control, so none of these are viable.
- **No per-request caching layer** (APCu) now — noted as an optional future
  optimization if `pending()`'s per-request cost ever matters.

## Architecture

### `App\AutoMigrator` (new)

Wraps `App\Migrator` with a MySQL advisory-lock single-flight guard. Constructed
with the `mysqli` connection and the migrations directory.

`maybeMigrate(): void`
1. `pending = migrator.pending(dir)`. If empty → return. This is the hot path:
   one `glob` + the `schema_migrations` lookup `Migrator::pending` already does,
   no lock, on (nearly) every request.
2. Pending is non-empty → `SELECT GET_LOCK('lescanetons_migrate', 30)`:
   - `1` (acquired): **re-check** `pending()` (a concurrent worker may have just
     finished). If now empty → `RELEASE_LOCK`, return. Otherwise
     `migrator.migrate(dir)`, then `RELEASE_LOCK`. On `migrate()` throwing,
     release the lock and rethrow.
   - `0` (timeout) or `NULL` (error) → throw. A contender waited past the
     timeout for an in-progress migration; failing loud (503 + Retry-After) is
     correct.

The lock name is a fixed application constant. Each request uses its own `mysqli`
connection, so `GET_LOCK` serializes across PHP-FPM workers; if the holder's
request dies, MariaDB frees the lock on connection close and a waiter proceeds.

### `bootstrap.php` hook

After `Database::connect($config['db'])` and before `Auth::startSession()`:

```php
if ($config['auto_migrate'] ?? true) {
    try {
        (new AutoMigrator(Database::get(), dirname(__DIR__) . '/sql/migrations'))
            ->maybeMigrate();
    } catch (\Throwable $e) {
        error_log('Auto-migration failed: ' . $e->getMessage());
        http_response_code(503);
        header('Retry-After: 30');
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><title>Maintenance</title>'
            . '<p>Site en maintenance, merci de réessayer dans un instant.</p>';
        exit;
    }
}
```

`dirname(__DIR__) . '/sql/migrations'` matches `app/api/migrate.php`'s resolution:
in the built `public/` it is `public/sql/migrations` (shipped by the build). In
dev (docker), `app/sql/migrations` does not exist, so `pending()` is a harmless
no-op and the docker `migrate` service keeps applying dev migrations as today.

### Config

Add `'auto_migrate' => true` to `config/config.example.php` and
`config/config.docker.php`. Code defaults to on when the key is absent
(`?? true`). Because `deploy.mjs`'s config-shape drift gate compares key *shape*
against `config.example.php`, each server's `config.php` must declare
`auto_migrate` before that server can deploy (rollout note below).

### CI cleanup (`.github/workflows/ci.yml`)

Remove the `Apply DB migrations (<env>)` steps from `deploy-test`, `deploy-qa`,
and `deploy-prod` — the runner cannot reach the hosts, and auto-migrate replaces
them. `tools/dbmigrate.mjs`, its npm scripts, and `/api/migrate` stay for manual
dry-run/inspection and fallback. (The diagnostic in `dbmigrate.mjs` from the
earlier fix stays — still useful for the manual/dry-run path.)

## Behavior after a deploy

1. FTP upload lands new code + `sql/migrations/*.sql` (FTP works from CI).
2. The **first request** after the deploy sees pending migrations, takes the
   lock, and applies them; that request waits for the DDL. Concurrent requests
   wait on the lock, then serve normally once migration completes.
3. No CI→host connection at any point.

For TEST/QA (behind Basic Auth) the trigger is the first authenticated visit;
for PROD, the first visitor. There is no automatic post-deploy hit from CI (it
can't reach the host), which is acceptable — the window is closed per-request,
not per-deploy.

## Testing

- **Unit** (`tests/Unit/AutoMigratorTest.php`): the flag-off path and the
  hot-path short-circuit. To keep it DB-free, `AutoMigrator` takes a seam for the
  pending-check/lock so a fake can assert "migrate never called when pending is
  empty / when disabled". (If a clean seam isn't natural, cover these via the
  integration test instead and keep the unit surface minimal — do not contort
  the design for testability.)
- **Integration** (`tests/Integration/AutoMigratorTest.php`, CI-only — needs
  mysqli): with a pending migration file in a temp dir, `maybeMigrate()` applies
  it and records it in `schema_migrations`; a second call is a no-op; the
  `GET_LOCK`/`RELEASE_LOCK` round-trip runs. Follows `MigratorTest`'s pattern
  (DDL auto-commits past the rollback → clean up its own artifacts).
- Local caveat (unchanged for this repo): integration tests run in CI only
  (`composer:2` image has no mysqli); unit tests + `npm run lint:php` run
  locally.

## Rollout notes

- Add `'auto_migrate' => true` to each server's `config.php` **before** the
  deploy that ships this (config-shape drift gate).
- After merge, CI no longer has a red migrate step; migrations self-apply on the
  first post-deploy request. Verify by visiting the env after a deploy.
- Fallback: if auto-migrate ever misbehaves on a server, set
  `'auto_migrate' => false` there and run `npm run dbmigrate:<env>` (or
  `/api/migrate`) from an allowlisted machine.
- `GET_LOCK` requires the DB user to have no special privilege (standard on
  MariaDB); the app DB user already used for queries suffices.
