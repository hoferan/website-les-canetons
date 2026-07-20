# Request-path Auto-Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply pending DB migrations server-side on the first post-deploy request (single-flight, fail-loud, flag-gated), removing the CI→host migration trigger that the host firewall makes impossible.

**Architecture:** A new `App\AutoMigrator` wraps `App\Migrator` with a MySQL `GET_LOCK` single-flight guard. `bootstrap.php` calls it after DB connect when `auto_migrate` is on; on error it emits a 503. The now-unreachable CI migrate steps are removed; `/api/migrate` + `tools/dbmigrate.mjs` stay for manual dry-run/fallback.

**Tech Stack:** PHP 8.4, MariaDB 10.3 (`GET_LOCK`/`RELEASE_LOCK`), PHPUnit, GitHub Actions.

## Global Constraints

- **PHP 8.4 / MariaDB 10.3** — no newer features.
- **PSR-4** — `app/src/` classes are `App\`, Composer-autoloaded, no manual require.
- **PSR-12** — enforced by `phpcs`; lines ≤ 100 chars.
- **Language rule** — English code/identifiers/keys; French only for on-screen strings (the 503 body).
- **Fail-loud** — a migration error yields HTTP 503; never serve against a half-migrated schema.
- **Single-flight** — concurrent post-deploy requests must not double-apply or deadlock (`GET_LOCK`).
- **Reuse `App\Migrator`** — do not reimplement migration logic.
- **Default on** — `$config['auto_migrate'] ?? true`.
- **`app/` is source**; never hand-edit `public/`; never commit `app/config.php`.
- Verify with: unit tests + `npm run lint:php` locally; integration tests run in CI only (the local `composer:2` image has no mysqli — the accepted repo constraint). Correct filtered unit run: `node tools/composer.mjs exec phpunit -- --filter <Test>`.

---

## File Structure

- **Create** `app/src/AutoMigrator.php` — single-flight wrapper around `Migrator`.
- **Create** `tests/Integration/AutoMigratorTest.php` — CI-only; applies-once + no-op-when-clean.
- **Modify** `app/src/bootstrap.php` — call `AutoMigrator` after DB connect; 503 on failure.
- **Modify** `config/config.example.php` + `config/config.docker.php` — `auto_migrate` key.
- **Modify** `.github/workflows/ci.yml` — remove the three `Apply DB migrations` steps.

---

## Task 1: `App\AutoMigrator`

**Files:**
- Create: `app/src/AutoMigrator.php`
- Test: `tests/Integration/AutoMigratorTest.php`

**Interfaces:**
- Consumes: `App\Migrator` (`pending(string $dir): string[]`, `migrate(string $dir): string[]`); a `mysqli` connection.
- Produces: `App\AutoMigrator::__construct(mysqli $db, string $migrationsDir)` and `maybeMigrate(): void`. Task 2 constructs `new AutoMigrator(Database::get(), dirname(__DIR__) . '/sql/migrations')` and calls `maybeMigrate()`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/Integration/AutoMigratorTest.php`:

```php
<?php

use App\AutoMigrator;
use App\Migrator;

/**
 * AutoMigrator does DDL (via Migrator), which MariaDB implicitly commits — so it
 * escapes IntegrationTestCase's transaction rollback. Like MigratorTest, this
 * test cleans up its own artifacts (its temp table + schema_migrations row).
 */
final class AutoMigratorTest extends IntegrationTestCase
{
    private string $dir;
    private string $version = '950_automigrator_test.sql';

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . '/automigrator_test_' . uniqid();
        mkdir($this->dir);
        file_put_contents(
            $this->dir . '/' . $this->version,
            'CREATE TABLE IF NOT EXISTS automigrator_test (id INT PRIMARY KEY) '
            . 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
        );
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        $this->cleanup();
        array_map('unlink', glob($this->dir . '/*'));
        rmdir($this->dir);
        parent::tearDown();
    }

    private function cleanup(): void
    {
        $this->db->query('DROP TABLE IF EXISTS automigrator_test');
        $res = $this->db->query("SHOW TABLES LIKE 'schema_migrations'");
        $exists = $res->num_rows > 0;
        $res->free();
        if ($exists) {
            $stmt = $this->db->prepare('DELETE FROM schema_migrations WHERE version = ?');
            $stmt->bind_param('s', $this->version);
            $stmt->execute();
            $stmt->close();
        }
    }

    public function testMaybeMigrateAppliesPendingAndRecordsIt(): void
    {
        (new AutoMigrator($this->db, $this->dir))->maybeMigrate();

        $res = $this->db->query("SHOW TABLES LIKE 'automigrator_test'");
        $created = $res->num_rows > 0;
        $res->free();
        $this->assertTrue($created, 'the pending migration should have run');
        $this->assertSame([], (new Migrator($this->db))->pending($this->dir));
    }

    public function testMaybeMigrateIsNoOpWhenNothingPending(): void
    {
        $auto = new AutoMigrator($this->db, $this->dir);
        $auto->maybeMigrate(); // applies
        $auto->maybeMigrate(); // nothing pending — must not throw or re-apply
        $this->assertSame([], (new Migrator($this->db))->pending($this->dir));
    }
}
```

- [ ] **Step 2: Run the test to confirm it fails (locally it errors on missing class; real run is CI)**

Run: `node tools/composer.mjs exec phpunit -- --filter AutoMigratorTest`
Expected locally: it does NOT pass — either `Error: Class "App\AutoMigrator" not found` or the pre-existing `mysqli_report()` env error (the `composer:2` image has no mysqli). Both are expected; the assertive run happens in CI. Do not try to make integration tests pass locally.

- [ ] **Step 3: Write the implementation**

Create `app/src/AutoMigrator.php`:

```php
<?php

namespace App;

use mysqli;
use RuntimeException;

/**
 * Applies pending migrations server-side on the first request after a deploy,
 * guarded by a MySQL advisory lock so concurrent PHP-FPM workers can't
 * double-apply or race. Hooked from bootstrap.php; reuses App\Migrator.
 *
 * Why request-path: the CI runner cannot reach the host to trigger
 * /api/migrate (the host firewalls the runner IP). Running here — where the DB
 * connection is local — needs no inbound connection and applies the schema
 * before the request that depends on it is served.
 */
final class AutoMigrator
{
    private const LOCK_NAME = 'lescanetons_migrate';
    private const LOCK_TIMEOUT_SECONDS = 30;

    public function __construct(
        private mysqli $db,
        private string $migrationsDir
    ) {
    }

    public function maybeMigrate(): void
    {
        $migrator = new Migrator($this->db);

        // Hot path: nothing pending -> no lock, no work. (nearly every request)
        if ($migrator->pending($this->migrationsDir) === []) {
            return;
        }

        if (!$this->acquireLock()) {
            // 0 = timed out waiting for an in-progress migration, NULL = error.
            throw new RuntimeException('Could not acquire migration lock');
        }
        try {
            // Re-check under the lock: a concurrent worker may have just finished.
            if ($migrator->pending($this->migrationsDir) !== []) {
                $migrator->migrate($this->migrationsDir);
            }
        } finally {
            $this->releaseLock();
        }
    }

    private function acquireLock(): bool
    {
        $res = $this->db->query(
            sprintf("SELECT GET_LOCK('%s', %d)", self::LOCK_NAME, self::LOCK_TIMEOUT_SECONDS)
        );
        $row = $res->fetch_row();
        $res->free();

        return isset($row[0]) && (string) $row[0] === '1';
    }

    private function releaseLock(): void
    {
        $res = $this->db->query(sprintf("SELECT RELEASE_LOCK('%s')", self::LOCK_NAME));
        if ($res instanceof \mysqli_result) {
            $res->free();
        }
    }
}
```

(`LOCK_NAME`/`LOCK_TIMEOUT_SECONDS` are class constants, not user input, so inlining them in the query string carries no injection risk.)

- [ ] **Step 4: Run the unit suite to confirm no regression**

Run: `node tools/composer.mjs exec phpunit -- --filter AltchaTest`
Expected: PASS (unrelated unit suite still green). The `AutoMigratorTest` integration assertions run in CI.

- [ ] **Step 5: Lint**

Run: `npm run lint:php`
Expected: no errors for `app/src/AutoMigrator.php` or the test.

- [ ] **Step 6: Commit**

```bash
git add app/src/AutoMigrator.php tests/Integration/AutoMigratorTest.php
git commit -m "feat(migrations): add App\\AutoMigrator (single-flight request-path migrator)"
```

---

## Task 2: bootstrap hook + config flag

**Files:**
- Modify: `app/src/bootstrap.php`
- Modify: `config/config.example.php`
- Modify: `config/config.docker.php`

**Interfaces:**
- Consumes: `App\AutoMigrator` from Task 1; `$config['auto_migrate']`.
- Produces: request-path behavior — after DB connect, pending migrations self-apply; a migration error returns HTTP 503 instead of a page.

- [ ] **Step 1: Add the `use` import in `app/src/bootstrap.php`**

After `use App\Auth;` (keep alphabetical grouping with the existing `use` block) add:

```php
use App\AutoMigrator;
```

- [ ] **Step 2: Add the hook after `Database::connect(...)`**

In `app/src/bootstrap.php`, immediately after the `Database::connect($config['db']);` line and before the `Auth::startSession();` line, insert:

```php
// Apply pending migrations server-side on the first request after a deploy
// (single-flight via GET_LOCK). The CI runner can't reach the host to trigger
// /api/migrate, so migrations self-apply here. Fail-loud: a migration error
// serves 503 rather than a page against a half-migrated schema.
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

`dirname(__DIR__) . '/sql/migrations'` resolves to `public/sql/migrations` in the built artifact (shipped by the build) — the same resolution `app/api/migrate.php` uses. In dev (docker) `app/sql/migrations` does not exist, so `pending()` is a harmless no-op and the docker `migrate` service keeps handling dev migrations.

- [ ] **Step 3: Add `auto_migrate` to `config/config.example.php`**

Immediately before the `'migrate' => [` block, insert:

```php
    // Apply pending DB migrations automatically on the first request after a
    // deploy (App\AutoMigrator, single-flight via GET_LOCK, fail-loud 503).
    // Default on. Set false on a server to fall back to manual migration
    // (npm run dbmigrate:<env> / POST /api/migrate) if it ever misbehaves.
    'auto_migrate' => true,
```

- [ ] **Step 4: Add `auto_migrate` to `config/config.docker.php`**

Immediately before the `'migrate' => [` block, insert:

```php
    // On in dev too; the docker `migrate` service still applies dev migrations
    // before web starts, so this is effectively a no-op there (app/sql/migrations
    // is absent in the dev layout) — present so the config shape matches.
    'auto_migrate' => true,
```

- [ ] **Step 5: Lint + confirm no regression**

Run: `npm run lint:php`
Expected: no errors.

Run: `node tools/composer.mjs exec phpunit -- --filter AltchaTest`
Expected: still PASS (bootstrap change doesn't touch unit-tested code).

- [ ] **Step 6: Manual sanity (optional, if a stack is quick to run)**

With `docker compose up -d` (or `npm run serve`), load the site: it should behave exactly as before (dev has no pending migrations at `app/sql/migrations`, so the hook is a no-op). Do not block on this if a stack isn't already running — reason through it instead: `auto_migrate` on, `pending()` over a non-existent dir returns `[]`, `maybeMigrate()` returns immediately.

- [ ] **Step 7: Commit**

```bash
git add app/src/bootstrap.php config/config.example.php config/config.docker.php
git commit -m "feat(migrations): auto-apply pending migrations from bootstrap (flag-gated, 503 on error)"
```

---

## Task 3: Remove the unreachable CI migrate steps

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: CI no longer attempts to reach the host for migrations (that's now request-path). `deploy:<env>` remains the last step of each deploy job.

- [ ] **Step 1: Remove the TEST migrate step**

In `.github/workflows/ci.yml`, delete this block (the comment + step) that currently follows `run: npm run deploy:test`:

```yaml
      # Migration is a separate step (not chained into deploy:test) so
      # `deploy:test -- --dry-run` reaches deploy.mjs. It runs only if the deploy
      # step succeeded; a failed migration fails the job.
      - name: Apply DB migrations (TEST)
        env:
          SITE_URL: ${{ secrets.SITE_URL }}
          MIGRATE_TOKEN: ${{ secrets.MIGRATE_TOKEN }}
          # TEST is behind HTTP Basic Auth; dbmigrate sends these to reach /api/migrate.
          BASIC_AUTH_USER: ${{ secrets.BASIC_AUTH_USER }}
          BASIC_AUTH_PASS: ${{ secrets.BASIC_AUTH_PASS }}
        run: npm run dbmigrate:test
```

`run: npm run deploy:test` becomes the last step of `deploy-test`.

- [ ] **Step 2: Remove the QA migrate step**

Delete this block that follows `run: npm run deploy:qa`:

```yaml
      # Separate step (not chained) so deploy:qa -- --dry-run reaches deploy.mjs.
      # QA is behind HTTP Basic Auth like TEST.
      - name: Apply DB migrations (QA)
        env:
          SITE_URL: ${{ secrets.SITE_URL }}
          MIGRATE_TOKEN: ${{ secrets.MIGRATE_TOKEN }}
          BASIC_AUTH_USER: ${{ secrets.BASIC_AUTH_USER }}
          BASIC_AUTH_PASS: ${{ secrets.BASIC_AUTH_PASS }}
        run: npm run dbmigrate:qa
```

`run: npm run deploy:qa` becomes the last step of `deploy-qa`.

- [ ] **Step 3: Remove the PROD migrate steps**

Delete this block (comment + both steps) that follows `run: npm run deploy:prod`:

```yaml
      # PROD safety: report pending migrations first (read-only), then apply.
      # Both run inside this manually-approved job (prod Environment gate). PROD
      # has no HTTP Basic Auth, so no BASIC_AUTH_* is sent.
      - name: Report pending DB migrations (PROD dry-run)
        env:
          SITE_URL: ${{ secrets.SITE_URL }}
          MIGRATE_TOKEN: ${{ secrets.MIGRATE_TOKEN }}
        run: npm run dbmigrate:prod -- --dry-run
      - name: Apply DB migrations (PROD)
        env:
          SITE_URL: ${{ secrets.SITE_URL }}
          MIGRATE_TOKEN: ${{ secrets.MIGRATE_TOKEN }}
        run: npm run dbmigrate:prod
```

`run: npm run deploy:prod` becomes the last step of `deploy-prod`.

- [ ] **Step 4: Validate the workflow YAML**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');require('js-yaml')? null:null" 2>/dev/null; npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "YAML OK"`
Expected: `YAML OK` (parses). If `js-yaml` isn't available, instead confirm by eye that each `deploy-*` job still has its `Deploy to <env> over FTP` step intact and indentation is unchanged.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(migrations): drop CI migrate steps (replaced by request-path auto-migration)"
```

---

## Rollout (operational — not a coding task)

1. Add `'auto_migrate' => true` to each server's `config.php` **before** the deploy that ships this (config-shape drift gate refuses otherwise).
2. After merge, CI deploys but no longer triggers migrations; they self-apply on the first request to each env after a deploy. Verify by visiting the env.
3. Fallback: set `'auto_migrate' => false` on a server and run `npm run dbmigrate:<env>` (or `/api/migrate`) from an allowlisted machine.

---

## Self-Review

**Spec coverage:**
- Goal 1 (server-side, all envs, no inbound) → Task 1 + Task 2 hook (runs every env via bootstrap). ✅
- Goal 2 (single-flight) → Task 1 `acquireLock`/re-check/`releaseLock`. ✅
- Goal 3 (fail-loud 503) → Task 2 Step 2 try/catch. ✅
- Goal 4 (cheap hot path) → Task 1 early `pending() === []` return before any lock. ✅
- Goal 5 (per-server opt-out, default on) → Task 2 `$config['auto_migrate'] ?? true` + config keys. ✅
- Goal 6 (reuse Migrator; keep /api/migrate + dbmigrate) → Task 1 uses `Migrator`; Task 3 removes only CI steps, not the endpoint/tooling. ✅
- Non-goal (remove CI trigger) → Task 3. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✅

**Type consistency:** `AutoMigrator::__construct(mysqli, string)` + `maybeMigrate(): void` defined in Task 1, constructed identically in Task 2. `Migrator::pending`/`migrate` signatures match the existing class. ✅
