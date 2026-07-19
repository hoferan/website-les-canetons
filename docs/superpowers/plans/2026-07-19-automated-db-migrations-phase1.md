# Automated DB Migrations — Phase 1 (TEST end-to-end) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship automated DB migrations for the TEST environment end-to-end: a shared `App\Migrator`, a token-gated `POST /api/migrate` endpoint that runs migrations server-side, a `dbmigrate` HTTPS trigger wired into `deploy:test` and CI, with migrations shipped in the artifact and hidden from direct web access.

**Architecture:** Migrations run **on the server** (remote DB login is blocked — see spec PoC), reusing `config.php`'s localhost DB connection. `App\Migrator` holds the single implementation; the HTTP endpoint and the dev/docker CLI runner both call it. A post-deploy `dbmigrate.mjs` step POSTs to the endpoint with a secret token; failure fails the deploy. Migrations are idempotent + backward-compatible, so the app survives a failed migration.

**Tech Stack:** PHP 8.4 + mysqli, `App\` PSR-4 under `app/src`, PHPUnit (integration tests against `lescanetons_test`), Node ESM tooling (no new npm deps), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-19-automated-db-migrations-design.md`

## Global Constraints

- PHP **8.4**, MariaDB **10.3**, `mysqli` extension. — from CLAUDE.md.
- `App\` classes are PSR-4 under `app/src/`, autoloaded via Composer. — from CLAUDE.md.
- **No DB credentials leave the server.** The endpoint reuses `config.php` via `App\Database::get()`; the trigger only holds a token + URL. — from spec.
- **Token auth:** `X-Migrate-Token` request header, compared with `hash_equals`; endpoint **disabled (404) when `migrate.token` is empty/unset**; **POST only** (else 405); mode default `dry-run`. — from spec.
- **Per-migration transaction + stop-on-first-failure.** DDL is not rollback-safe on MariaDB — do not claim otherwise; safety comes from idempotent, backward-compatible migrations. — from spec.
- **Migration SQL must be unreachable via direct HTTP** (the front-controller catch-all already ensures this; no new `.htaccess` rule). — from spec.
- **No new npm dependencies.** — from spec.
- Everything in **English** (code, comments, identifiers). — from CLAUDE.md.
- **Conventional Commits**; end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Migrations authored **idempotently** (`IF [NOT] EXISTS`) and **backward-compatibly** (expand-contract). — from spec.

---

## File Structure

- **Create** `app/src/Migrator.php` — `App\Migrator`, the single migration-logic unit.
- **Create** `app/api/migrate.php` — token-gated JSON endpoint using `App\Migrator`.
- **Create** `tools/dbmigrate.mjs` — HTTPS trigger; `dbmigrate:test|qa|prod` npm scripts.
- **Create** `tests/Integration/MigratorTest.php` — PHPUnit integration tests.
- **Create** `.env.test.example`, `.env.qa.example`, `.env.prod.example` — per-env templates.
- **Modify** `app/src/routes.php` — register the `migrate` API route.
- **Modify** `tools/migrate.php` — thin CLI wrapper over `App\Migrator`.
- **Modify** `docker-compose.yml` — mount `./app/src` into the `migrate` service.
- **Modify** `tools/build.mjs` — copy `sql/migrations/` into `public/`.
- **Modify** `config/config.example.php`, `config/config.docker.php` — add `migrate.token`.
- **Modify** `tools/deploy.mjs` — layered `.env.<target>` + `.env` load.
- **Modify** `package.json` — `dbmigrate:*` scripts; chain `dbmigrate:test` into `deploy:test`.
- **Modify** `.github/workflows/ci.yml` — migrate step in `deploy-test`.
- **Modify** `staging/test/.htaccess`, `staging/qa/.htaccess` — Basic-Auth exception for `/api/migrate`.
- **Modify** `.env.example`, `sql/migrations/README.md`, `CLAUDE.md`, `staging/README.md` — docs.

---

### Task 1: `App\Migrator` + integration tests

**Files:**
- Create: `app/src/Migrator.php`
- Test: `tests/Integration/MigratorTest.php`

**Interfaces:**
- Consumes: an open `mysqli` connection (from `App\Database` or the CLI wrapper).
- Produces:
  - `App\Migrator::__construct(\mysqli $db)`
  - `Migrator::pending(string $dir): string[]` — read-only; pending versions ascending; does NOT create `schema_migrations`.
  - `Migrator::migrate(string $dir): string[]` — applies pending (each in a transaction), records them, returns applied versions; throws `RuntimeException` on first failure.

- [ ] **Step 1: Write the failing test**

Create `tests/Integration/MigratorTest.php`. It uses a temp directory of throwaway `.sql` files and cleans up its own DDL (which escapes the base class's transaction rollback):

```php
<?php

use App\Migrator;

/**
 * Migrations do DDL, which MariaDB implicitly commits — so it escapes
 * IntegrationTestCase's transaction rollback. This test therefore cleans up its
 * own artifacts (the test table + its schema_migrations rows) explicitly.
 */
final class MigratorTest extends IntegrationTestCase
{
    private string $dir;

    /** @var string[] */
    private array $versions = ['900_migrator_test_create.sql', '901_migrator_test_seed.sql'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . '/migrator_test_' . uniqid();
        mkdir($this->dir);
        file_put_contents(
            $this->dir . '/900_migrator_test_create.sql',
            'CREATE TABLE IF NOT EXISTS migrator_test (id INT PRIMARY KEY, label VARCHAR(50)) '
            . 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
        );
        file_put_contents(
            $this->dir . '/901_migrator_test_seed.sql',
            "INSERT INTO migrator_test (id, label) VALUES (1, 'a');"
        );
        $this->cleanupArtifacts();
    }

    protected function tearDown(): void
    {
        $this->cleanupArtifacts();
        array_map('unlink', glob($this->dir . '/*'));
        rmdir($this->dir);
        parent::tearDown();
    }

    private function cleanupArtifacts(): void
    {
        $this->db->query('DROP TABLE IF EXISTS migrator_test');
        $res = $this->db->query("SHOW TABLES LIKE 'schema_migrations'");
        $exists = $res->num_rows > 0;
        $res->free();
        if ($exists) {
            $in = "'" . implode("','", $this->versions) . "'";
            $this->db->query("DELETE FROM schema_migrations WHERE version IN ($in)");
        }
    }

    public function testPendingListsUnappliedFilesInOrder(): void
    {
        $pending = (new Migrator($this->db))->pending($this->dir);
        $this->assertSame($this->versions, $pending);
    }

    public function testMigrateAppliesRecordsAndReturnsVersions(): void
    {
        $migrator = new Migrator($this->db);
        $applied = $migrator->migrate($this->dir);

        $this->assertSame($this->versions, $applied);
        // Table + row exist.
        $row = $this->db->query('SELECT label FROM migrator_test WHERE id = 1')->fetch_assoc();
        $this->assertSame('a', $row['label']);
        // Nothing pending now.
        $this->assertSame([], $migrator->pending($this->dir));
    }

    public function testMigrateIsIdempotentOnRerun(): void
    {
        $migrator = new Migrator($this->db);
        $migrator->migrate($this->dir);
        $this->assertSame([], $migrator->migrate($this->dir));
    }

    public function testFailingMigrationThrowsAndIsNotRecorded(): void
    {
        file_put_contents($this->dir . '/902_migrator_test_bad.sql', 'THIS IS NOT SQL;');
        $this->versions[] = '902_migrator_test_bad.sql';
        $migrator = new Migrator($this->db);

        try {
            $migrator->migrate($this->dir);
            $this->fail('Expected a RuntimeException');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('902_migrator_test_bad.sql', $e->getMessage());
        }
        // The bad migration is not recorded, so it is still pending.
        $this->assertContains('902_migrator_test_bad.sql', $migrator->pending($this->dir));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:php -- --filter MigratorTest`
Expected: FAIL — `Error: Class "App\Migrator" not found` (class doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `app/src/Migrator.php`:

```php
<?php

namespace App;

use mysqli;
use mysqli_sql_exception;
use RuntimeException;

/**
 * Applies numbered SQL migrations (sql/migrations/NNN_*.sql) idempotently,
 * tracked in a schema_migrations table. Single source of migration logic,
 * shared by the CLI runner (tools/migrate.php, dev/docker) and the HTTP
 * endpoint (app/api/migrate.php, server-side deploys).
 *
 * DDL note: MariaDB implicitly commits on CREATE/ALTER/DROP, so schema changes
 * are NOT rolled back by the per-migration transaction below. That transaction
 * makes DML and the schema_migrations bookkeeping atomic and stops the run on
 * the first failure. Migrations must be authored idempotently and
 * backward-compatibly — see sql/migrations/README.md.
 */
final class Migrator
{
    public function __construct(private mysqli $db)
    {
    }

    /** Migration files in ascending order. */
    private function files(string $dir): array
    {
        $files = glob(rtrim($dir, '/') . '/[0-9]*.sql') ?: [];
        sort($files, SORT_STRING);
        return $files;
    }

    private function schemaTableExists(): bool
    {
        $res = $this->db->query("SHOW TABLES LIKE 'schema_migrations'");
        $exists = $res->num_rows > 0;
        $res->free();
        return $exists;
    }

    /** Versions already recorded as applied (empty when the table is absent). */
    private function appliedVersions(): array
    {
        if (!$this->schemaTableExists()) {
            return [];
        }
        $applied = [];
        $res = $this->db->query('SELECT version FROM schema_migrations');
        while ($row = $res->fetch_assoc()) {
            $applied[$row['version']] = true;
        }
        $res->free();
        return $applied;
    }

    /**
     * Pending migration versions (filenames) in ascending order, WITHOUT
     * applying them or creating any table. Read-only — safe for dry-run.
     *
     * @return string[]
     */
    public function pending(string $dir): array
    {
        $applied = $this->appliedVersions();
        $pending = [];
        foreach ($this->files($dir) as $file) {
            $version = basename($file);
            if (!isset($applied[$version])) {
                $pending[] = $version;
            }
        }
        return $pending;
    }

    private function ensureSchemaTable(): void
    {
        $this->db->query(
            'CREATE TABLE IF NOT EXISTS schema_migrations ('
            . 'version VARCHAR(255) NOT NULL PRIMARY KEY, '
            . 'applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    }

    /**
     * Applies every pending migration in ascending order, each in its own
     * transaction, recording it in schema_migrations. Stops and throws on the
     * first failure. Idempotent: already-applied files are skipped.
     *
     * @return string[] versions applied this run
     */
    public function migrate(string $dir): array
    {
        $this->ensureSchemaTable();
        $applied = $this->appliedVersions();
        $ran = [];
        foreach ($this->files($dir) as $file) {
            $version = basename($file);
            if (isset($applied[$version])) {
                continue;
            }
            $sql = (string) file_get_contents($file);
            $this->db->begin_transaction();
            try {
                $this->db->multi_query($sql);
                do {
                    if ($result = $this->db->store_result()) {
                        $result->free();
                    }
                } while ($this->db->more_results() && $this->db->next_result());
                $stmt = $this->db->prepare('INSERT INTO schema_migrations (version) VALUES (?)');
                $stmt->bind_param('s', $version);
                $stmt->execute();
                $stmt->close();
                $this->db->commit();
            } catch (mysqli_sql_exception $e) {
                $this->db->rollback();
                throw new RuntimeException("Migration {$version} failed: {$e->getMessage()}", 0, $e);
            }
            $ran[] = $version;
        }
        return $ran;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:php -- --filter MigratorTest`
Expected: PASS — 4/4 tests, output pristine.

- [ ] **Step 5: Commit**

```bash
git add app/src/Migrator.php tests/Integration/MigratorTest.php
git commit -m "feat(migrations): add App\\Migrator (pending/migrate) with integration tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Refactor `tools/migrate.php` to a thin wrapper + docker mount

**Files:**
- Modify: `tools/migrate.php`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `App\Migrator` from Task 1.
- Produces: no new callable API — the docker `migrate` service and local dev keep working, now via `App\Migrator`.

- [ ] **Step 1: Replace `tools/migrate.php` with a thin wrapper**

Replace the entire contents of `tools/migrate.php` with:

```php
<?php

// Dev/CI CLI migration runner (docker `migrate` service + local dev). Applies
// sql/migrations/NNN_*.sql via App\Migrator, connecting with DB_* env vars.
// Production/staging migrate server-side over HTTP via app/api/migrate.php;
// this CLI path is for the docker-compose `migrate` service and local runs.
// Idempotent. All migration logic lives in App\Migrator (single source).

require __DIR__ . '/../app/src/Migrator.php';

use App\Migrator;

$dir  = $argv[1] ?? (__DIR__ . '/../sql/migrations');
$host = getenv('DB_HOST') ?: 'db';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: 'root';
$name = getenv('DB_NAME') ?: 'lescanetons';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$attempts = 0;
$maxAttempts = 30; // ~30s at 1s/attempt, generous for a cold MariaDB init
while (true) {
    try {
        $db = new mysqli($host, $user, $pass, $name);
        break;
    } catch (mysqli_sql_exception $e) {
        if (++$attempts >= $maxAttempts) {
            fwrite(STDERR, "Could not connect to DB after {$maxAttempts} attempts: {$e->getMessage()}\n");
            exit(1);
        }
        sleep(1);
    }
}
$db->set_charset('utf8mb4');

try {
    $ran = (new Migrator($db))->migrate($dir);
} catch (RuntimeException $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

echo 'Migrations up to date (' . count($ran) . " applied this run).\n";
```

Note: `require` of the class file directly (not Composer autoload) so the docker `migrate` service needs only `app/src` mounted, not `vendor/`.

- [ ] **Step 2: Mount `app/src` into the docker `migrate` service**

In `docker-compose.yml`, in the `migrate` service's `volumes:` list (currently `./tools` and `./sql/migrations`), add the `app/src` mount:

```yaml
    volumes:
      - ./tools:/repo/tools:ro
      - ./sql/migrations:/repo/sql/migrations:ro
      - ./app/src:/repo/app/src:ro
```

(The `command` stays `["php", "tools/migrate.php", "sql/migrations"]`; `tools/migrate.php` now resolves `../app/src/Migrator.php` = `/repo/app/src/Migrator.php`.)

- [ ] **Step 3: Verify the CLI wrapper still applies migrations**

Run: `php -l tools/migrate.php` (syntax) — expected: `No syntax errors`.
Then, if Docker is available: `docker compose up migrate --build` and confirm it ends with `Migrations up to date (... applied this run).` and exit 0. If Docker is unavailable (web session), run the equivalent against the dev stack: `node tools/ensure-dev-stack.mjs && DB_HOST=127.0.0.1 DB_USER=canetons DB_PASS=canetons DB_NAME=lescanetons php tools/migrate.php sql/migrations` and confirm the same success line.

- [ ] **Step 4: Commit**

```bash
git add tools/migrate.php docker-compose.yml
git commit -m "refactor(migrations): tools/migrate.php delegates to App\\Migrator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `POST /api/migrate` endpoint + route + `migrate.token` config

**Files:**
- Create: `app/api/migrate.php`
- Modify: `app/src/routes.php`
- Modify: `config/config.example.php`, `config/config.docker.php`

**Interfaces:**
- Consumes: `App\Migrator`, `App\Database::get()`, `App\Env::current()`; `config.php`'s `migrate.token`.
- Produces: HTTP `POST /api/migrate` returning JSON `{ mode, environment, applied, pending, status }`.

- [ ] **Step 1: Add the `migrate.token` config key**

In `config/config.example.php`, add a new top-level section (after `features`):

```php
    // Secret token gating the server-side migration endpoint (POST /api/migrate).
    // Set a long random value per server. Empty/unset disables the endpoint (404).
    'migrate' => [
        'token' => 'CHANGE_ME',
    ],
```

In `config/config.docker.php`, add the same section (local dev migrates via the
docker `migrate` service, not the endpoint, so the value is unused locally but
keeps the config shape consistent):

```php
    // Unused locally (docker migrates via the `migrate` service, not HTTP), but
    // present so the config shape matches config.example.php.
    'migrate' => [
        'token' => 'dev-local-unused',
    ],
```

- [ ] **Step 2: Create the endpoint**

Create `app/api/migrate.php`:

```php
<?php

// Token-gated server-side migration endpoint. Runs sql/migrations/*.sql via
// App\Migrator using config.php's localhost DB connection. Triggered over HTTPS
// by tools/dbmigrate.mjs as a post-deploy step. Not session-authenticated:
// gated by a secret token (config migrate.token), compared in constant time.
// Disabled (404) when no token is configured, so an unconfigured server is inert.

use App\Database;
use App\Env;
use App\Migrator;

header('Content-Type: application/json');

$config = require __DIR__ . '/../config.php';
$expected = (string) ($config['migrate']['token'] ?? '');

// No token configured -> endpoint does not exist here.
if ($expected === '') {
    http_response_code(404);
    require __DIR__ . '/../pages/404.php';
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$supplied = (string) ($_SERVER['HTTP_X_MIGRATE_TOKEN'] ?? '');
if (!hash_equals($expected, $supplied)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$mode = ($_GET['mode'] ?? 'dry-run') === 'apply' ? 'apply' : 'dry-run';
$dir = __DIR__ . '/../sql/migrations';
$migrator = new Migrator(Database::get());

try {
    if ($mode === 'apply') {
        $applied = $migrator->migrate($dir);
        $pending = [];
    } else {
        $applied = [];
        $pending = $migrator->pending($dir);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status'      => 'error',
        'mode'        => $mode,
        'environment' => Env::current(),
        'error'       => $e->getMessage(),
    ]);
    exit;
}

echo json_encode([
    'status'      => 'ok',
    'mode'        => $mode,
    'environment' => Env::current(),
    'applied'     => $applied,
    'pending'     => $pending,
]);
```

- [ ] **Step 3: Register the route**

In `app/src/routes.php`, add `'migrate'` to the base `$apis` array (unconditional — not behind the `souper_signup` flag):

```php
    $apis = ['contact', 'logout', 'events', 'login', 'responses', 'migrate'];
```

- [ ] **Step 4: Verify the endpoint locally**

Ensure a local `app/config.php` exists with a `migrate.token` (e.g. copy from example and set `'token' => 'localtoken'`, `env => 'dev'`). Start the dev server and exercise the endpoint:

Run: `npm run serve` (in one shell), then in another:
```bash
# Missing/blank token -> 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8090/api/migrate      # 401
# Wrong method -> 405
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/api/migrate               # 405 (GET)
# Correct token, dry-run -> 200 JSON with a "pending" array, applies nothing
curl -s -X POST -H 'X-Migrate-Token: localtoken' 'http://127.0.0.1:8090/api/migrate?mode=dry-run'
# Correct token, apply -> 200 JSON with "applied"
curl -s -X POST -H 'X-Migrate-Token: localtoken' 'http://127.0.0.1:8090/api/migrate?mode=apply'
```
Expected: 401, 405, then two `{"status":"ok",...}` JSON bodies; the dry-run's `pending` is empty if the dev DB is already migrated (that's fine — the assertion is the shape + status, not specific pending items).

- [ ] **Step 5: Commit**

```bash
git add app/api/migrate.php app/src/routes.php config/config.example.php config/config.docker.php
git commit -m "feat(migrations): token-gated POST /api/migrate endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ship `sql/migrations/` in the build

**Files:**
- Modify: `tools/build.mjs`

**Interfaces:**
- Consumes: `sql/migrations/` in the repo.
- Produces: `public/sql/migrations/*.sql` in the built artifact (unreachable via HTTP by the existing front-controller catch-all).

- [ ] **Step 1: Copy migrations into the artifact**

In `tools/build.mjs`, immediately after the `cpSync('app', 'public', { recursive: true });` line, add:

```javascript
// Ship the numbered migrations so the server-side endpoint (public/api/migrate.php)
// can apply them. They live under public/sql/migrations and are unreachable via
// direct HTTP: the front-controller catch-all (app/.htaccess) rewrites any
// non-/assets/ path to index.php, which 404s anything that isn't a route.
cpSync('sql/migrations', 'public/sql/migrations', { recursive: true });
```

- [ ] **Step 2: Verify the build includes them**

Run: `npm run build`
Then: `ls public/sql/migrations` — expected: the numbered `.sql` files (e.g. `001_create_signups.sql`) and `README.md` present.

- [ ] **Step 3: Verify they are not web-served (route-miss → 404)**

Run: `npm run serve` (uses `app/`, not `public/`, but the routing is identical), then:
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/sql/migrations/001_create_signups.sql
```
Expected: `404` (not `/assets/`, not a route → front controller 404s).

- [ ] **Step 4: Commit**

```bash
git add tools/build.mjs
git commit -m "build(migrations): ship sql/migrations into the deploy artifact

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `.env` refactor — layered per-env load (separate commit)

**Files:**
- Modify: `tools/deploy.mjs`
- Create: `.env.test.example`, `.env.qa.example`, `.env.prod.example`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `loadDotEnv(file)` from `tools/dotenv.mjs` (already supports a filename).
- Produces: tooling loads `.env.<target>` then `.env` (env-specific wins, shared fills in). `deploy.mjs`'s per-target guard is unchanged (keys keep their `FTP_<ENV>_DIR` names).

- [ ] **Step 1: Layer the dotenv load in `deploy.mjs`**

In `tools/deploy.mjs`, `main()` currently calls `loadDotEnv();`. It runs after `parseArgs()` returns `target`. Replace the single call so the env-specific file loads first, then the shared base:

Find:
```javascript
  loadDotEnv();
```
Replace with:
```javascript
  // Env-specific values (FTP dir, migrate token, site URL, htpasswd path) live
  // in .env.<target>; shared secrets (FTP host/user/pass) in .env. Load the
  // env-specific file first — loadDotEnv never overwrites an already-set var, so
  // env-specific wins and .env fills in the shared rest.
  loadDotEnv(`.env.${target}`);
  loadDotEnv('.env');
```

- [ ] **Step 2: Update `.env.example` to shared-only + add per-env examples**

Rewrite `.env.example` so it documents only the shared keys:

```bash
# Shared deploy secrets (used by all environments). Copy to `.env`.
# Per-environment values live in .env.test / .env.qa / .env.prod (see the
# .env.<env>.example templates). Plain FTP.
FTP_HOST=CHANGE_ME
FTP_USER=CHANGE_ME
FTP_PASS=CHANGE_ME
```

Create `.env.test.example`:

```bash
# TEST environment. Copy to `.env.test` (git-ignored). Loaded before .env by the
# deploy + dbmigrate tooling.
FTP_TEST_DIR=CHANGE_ME
HTPASSWD_PATH_TEST=CHANGE_ME
# Server-side migration endpoint (must match `migrate.token` in the TEST
# server's config.php) and the public base URL to POST to.
MIGRATE_TOKEN=CHANGE_ME
SITE_URL=https://<test-host>
```

Create `.env.qa.example`:

```bash
# QA environment. Copy to `.env.qa` (git-ignored).
FTP_QA_DIR=CHANGE_ME
HTPASSWD_PATH_QA=CHANGE_ME
MIGRATE_TOKEN=CHANGE_ME
SITE_URL=https://<qa-host>
```

Create `.env.prod.example`:

```bash
# PROD environment. Copy to `.env.prod` (git-ignored).
FTP_PROD_DIR=CHANGE_ME
MIGRATE_TOKEN=CHANGE_ME
SITE_URL=https://<prod-host>
```

- [ ] **Step 3: Confirm `.gitignore` covers the new env files**

Run: `git check-ignore .env.test .env.qa .env.prod`
Expected: all three printed (ignored). If any is NOT printed, add a line `/.env.*` to `.gitignore` **but** keep the `*.example` files tracked by also adding `!/.env.example` and `!/.env.*.example`. (Verify `git status` still shows the `.example` files as trackable.)

- [ ] **Step 4: Migrate the local `.env` and verify the dry-run still works**

Locally (not committed): split the existing `.env` — keep `FTP_HOST/USER/PASS` in `.env`, move `FTP_TEST_DIR` + `HTPASSWD_PATH_TEST` into `.env.test`, and add `MIGRATE_TOKEN` + `SITE_URL` there (from the TEST server).

Run: `npm run deploy:test -- --dry-run 2>&1 | tail -5`
Expected: the dry-run runs and prints its plan (no "Missing FTP settings" error), proving the layered load resolves the same values as before.

- [ ] **Step 5: Commit**

```bash
git add tools/deploy.mjs .env.example .env.test.example .env.qa.example .env.prod.example .gitignore
git commit -m "refactor(deploy): layered per-env .env (.env.<target> + .env)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `tools/dbmigrate.mjs` + npm scripts

**Files:**
- Create: `tools/dbmigrate.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: layered `.env.<target>` + `.env` (from Task 5); env vars `SITE_URL`, `MIGRATE_TOKEN`.
- Produces: `npm run dbmigrate:test|qa|prod` (with `-- --dry-run`), POSTing to `${SITE_URL}/api/migrate`; exits non-zero on failure.

- [ ] **Step 1: Create the trigger**

Create `tools/dbmigrate.mjs`:

```javascript
// Triggers the server-side migration endpoint (POST <SITE_URL>/api/migrate) as
// a post-deploy step. Reads SITE_URL + MIGRATE_TOKEN from .env.<target> (then
// .env). --dry-run reports pending migrations without applying. Exits non-zero
// on any non-2xx response or a status != "ok", so a failed migration fails the
// deploy. DB credentials never appear here — the endpoint uses the server's
// config.php.
import { loadDotEnv } from './dotenv.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TARGETS = ['test', 'qa', 'prod'];
const target = args.find((a) => !a.startsWith('--'));
if (!target || !TARGETS.includes(target)) {
  console.error(`Usage: node tools/dbmigrate.mjs <${TARGETS.join('|')}> [--dry-run]`);
  process.exit(1);
}

// Env-specific first (wins), then shared base — matches deploy.mjs.
loadDotEnv(`.env.${target}`);
loadDotEnv('.env');

const siteUrl = process.env.SITE_URL;
const token = process.env.MIGRATE_TOKEN;
const missing = [!siteUrl && 'SITE_URL', !token && 'MIGRATE_TOKEN'].filter(Boolean);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')} — set them in .env.${target} (see .env.${target}.example).`);
  process.exit(1);
}

const mode = DRY_RUN ? 'dry-run' : 'apply';
const url = `${siteUrl.replace(/\/$/, '')}/api/migrate?mode=${mode}`;
console.log(`${target.toUpperCase()} migrate (${mode}) -> ${siteUrl.replace(/\/$/, '')}/api/migrate`);

let res;
let body;
try {
  res = await fetch(url, { method: 'POST', headers: { 'X-Migrate-Token': token } });
  body = await res.json();
} catch (err) {
  console.error(`Migration request failed: ${err.message}`);
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));

if (!res.ok || body.status !== 'ok') {
  console.error(`\nMigration ${mode} FAILED (HTTP ${res.status}).`);
  process.exit(1);
}

if (mode === 'dry-run') {
  console.log(`\nPending: ${body.pending?.length ? body.pending.join(', ') : '(none)'}`);
} else {
  console.log(`\nApplied: ${body.applied?.length ? body.applied.join(', ') : '(none — already up to date)'}`);
}
```

- [ ] **Step 2: Add the npm scripts**

In `package.json` `scripts`, add (next to the `deploy:*` scripts):

```json
    "dbmigrate:test": "node tools/dbmigrate.mjs test",
    "dbmigrate:qa": "node tools/dbmigrate.mjs qa",
    "dbmigrate:prod": "node tools/dbmigrate.mjs prod",
```

- [ ] **Step 3: Verify argument/handling behavior (no server needed)**

Run: `node tools/dbmigrate.mjs` — expected: usage error, exit 1.
Run (with a bogus URL to prove non-zero on failure):
```bash
SITE_URL=http://127.0.0.1:1 MIGRATE_TOKEN=x node tools/dbmigrate.mjs test --dry-run; echo "exit=$?"
```
Expected: prints `Migration request failed: ...` and `exit=1`.

(Full end-to-end against real TEST happens in Task 8, after the endpoint is deployed.)

- [ ] **Step 4: Commit**

```bash
git add tools/dbmigrate.mjs package.json
git commit -m "feat(migrations): dbmigrate.mjs HTTPS trigger + dbmigrate:* scripts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Staging Basic-Auth exception for `/api/migrate`

**Files:**
- Modify: `staging/test/.htaccess`, `staging/qa/.htaccess`

**Interfaces:**
- Consumes: existing staging auth block (merged by `tools/build-overlays.mjs`).
- Produces: `/api/migrate` reachable on TEST/QA with the token alone (no Basic Auth), everything else still `Require valid-user`.

- [ ] **Step 1: Add the RequireAny exception (both files)**

In **both** `staging/test/.htaccess` and `staging/qa/.htaccess`, replace the auth requirement block. Find:

```apache
AuthType Basic
AuthName "Les Canetons — TEST (acces restreint)"
AuthUserFile "__HTPASSWD_PATH__"
Require valid-user
```
(the `AuthName` differs per file — TEST vs QA; keep each file's existing name)

Replace the `Require valid-user` line with a scoped exception so the CI/token-driven migration endpoint bypasses Basic Auth while everything else still requires it:

```apache
AuthType Basic
AuthName "Les Canetons — TEST (acces restreint)"
AuthUserFile "__HTPASSWD_PATH__"

# The server-side migration endpoint is triggered by CI over HTTPS and gated by
# its own secret token (see app/api/migrate.php); exclude it from Basic Auth so
# automated deploys can reach it. Everything else still requires a valid user.
SetEnvIf Request_URI "^/api/migrate" MIGRATE_ENDPOINT
<RequireAny>
    Require env MIGRATE_ENDPOINT
    Require valid-user
</RequireAny>
```

(Use the correct `AuthName` already present in each file — do not change it.)

- [ ] **Step 2: Verify the overlay builds with the exception**

Run: `npm run build:overlay test`
Then: inspect `dist/overlay/test/.htaccess` and confirm it contains the `SetEnvIf Request_URI "^/api/migrate"` and `<RequireAny>` block above the generated front-controller section.

Expected: the block is present; `npm run build:overlay test` exits 0.

- [ ] **Step 3: Commit**

```bash
git add staging/test/.htaccess staging/qa/.htaccess
git commit -m "feat(migrations): exclude /api/migrate from staging Basic Auth

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire `dbmigrate:test` into `deploy:test` + CI, and prove end-to-end

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `deploy.mjs` (Task 5), `dbmigrate.mjs` (Task 6), the deployed endpoint (Task 3), the staging auth exception (Task 7).
- Produces: `npm run deploy:test` runs the upload+verify and then applies migrations; CI `deploy-test` does the same after upload.

**Pre-req (manual, one-time, done by the maintainer before this task's end-to-end step):**
- Add `migrate.token` to the TEST server's `config.php` (a long random value).
- Set the same value as `MIGRATE_TOKEN` and the correct `SITE_URL` in local `.env.test` (and later as the `test` GitHub Environment secrets `MIGRATE_TOKEN` / `SITE_URL`).
- Re-upload the TEST `.htaccess` overlay (from Task 7) so the endpoint bypasses Basic Auth.

- [ ] **Step 1: Chain the migrate step into `deploy:test`**

In `package.json`, update the `deploy:test` script so migration runs after a successful deploy:

```json
    "deploy:test": "npm run build && node tools/deploy.mjs test && node tools/dbmigrate.mjs test",
```

(A failed `deploy.mjs` short-circuits `&&`, so migration only runs after a successful upload+verify; a failed `dbmigrate` fails the whole command.)

- [ ] **Step 2: Add the migrate step to the CI `deploy-test` job**

In `.github/workflows/ci.yml`, in the `deploy-test` job, after the existing deploy step (the one that runs `npm run deploy:test` — note it will now include migration via the chained script) OR, if the job calls `node tools/deploy.mjs test` directly, add a following step. Concretely, ensure the job runs migration after upload by adding this step after the deploy step:

```yaml
      - name: Apply DB migrations (TEST)
        run: node tools/dbmigrate.mjs test
        env:
          SITE_URL: ${{ secrets.SITE_URL }}
          MIGRATE_TOKEN: ${{ secrets.MIGRATE_TOKEN }}
```

If the deploy step already runs `npm run deploy:test` (which now chains `dbmigrate:test`), instead add the two env vars (`SITE_URL`, `MIGRATE_TOKEN`) to that existing step's `env:` block rather than adding a duplicate migrate step. Pick one path so migration runs exactly once. Document the chosen path in the commit message.

- [ ] **Step 3: End-to-end verification against real TEST**

After the manual pre-reqs above, run locally:
```bash
node tools/dbmigrate.mjs test --dry-run     # reports pending (200, status ok)
node tools/dbmigrate.mjs test               # applies (200, status ok)
node tools/dbmigrate.mjs test               # idempotent: applied is (none)
# Bad token is rejected:
MIGRATE_TOKEN=wrong node tools/dbmigrate.mjs test --dry-run; echo "exit=$?"   # non-zero
# Migration file not web-served:
curl -s -o /dev/null -w '%{http_code}\n' -u <basic-auth-user>:<pass> "$SITE_URL/sql/migrations/001_create_signups.sql"  # 404
```
Expected: dry-run lists pending (or none if already applied); apply returns `status ok`; re-run applies nothing; wrong token exits non-zero; direct `.sql` GET is 404.

- [ ] **Step 4: Commit**

```bash
git add package.json .github/workflows/ci.yml
git commit -m "ci(migrations): apply DB migrations after the TEST deploy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documentation

**Files:**
- Modify: `sql/migrations/README.md`, `CLAUDE.md`, `staging/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: authoring rules + operator/deploy docs.

- [ ] **Step 1: Migration authoring rules in `sql/migrations/README.md`**

In `sql/migrations/README.md`, replace the "Applying on production (manual)" section with an automated-flow section and add authoring rules. Insert this after the "Naming" section and remove the now-obsolete manual-prod steps:

```markdown
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
```

- [ ] **Step 2: Update `CLAUDE.md`**

In `CLAUDE.md`, in the deploy tooling area, add a bullet describing automated migrations:

```markdown
- **Automated DB migrations:** after each deploy, `npm run dbmigrate:<env>`
  triggers the token-gated server-side endpoint `POST /api/migrate`
  (`app/api/migrate.php` → `App\Migrator`), which applies `sql/migrations/*.sql`
  using the server's `config.php` DB connection (remote DB login is blocked, so
  migrations run server-side). `deploy:<env>` runs it after the upload; a failed
  migration fails the deploy. `-- --dry-run` reports pending without applying.
  Requires a `migrate.token` in each server's `config.php` and `MIGRATE_TOKEN` /
  `SITE_URL` in `.env.<env>` (or the env's CI secrets). Migrations must be
  idempotent + backward-compatible (see `sql/migrations/README.md`).
```

- [ ] **Step 3: Update `staging/README.md`**

In `staging/README.md`, add a note that the staging `.htaccess` excludes
`/api/migrate` from Basic Auth (token-gated instead), and that after changing
the auth block the overlay must be rebuilt (`npm run build:overlay <env>`) and
re-uploaded. Add near the auth/overlay section:

```markdown
- **Migration endpoint exception:** the staging `.htaccess` excludes
  `/api/migrate` from Basic Auth (it is gated by its own secret token so CI can
  trigger it over HTTPS). After editing the auth block, rebuild the overlay
  (`npm run build:overlay <env>`) and re-upload the `.htaccess`.
```

- [ ] **Step 4: Verify docs render / no broken checks**

Run: `npm run check` — expected: passes (docs are Markdown; this confirms nothing else regressed). If `check` is too heavy locally, at minimum run `npm run lint:php` to confirm the PHP added in earlier tasks still lints.

- [ ] **Step 5: Commit**

```bash
git add sql/migrations/README.md CLAUDE.md staging/README.md
git commit -m "docs(migrations): automated migration flow + authoring rules

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Server-side runner reusing config.php → Task 3 (endpoint uses `Database::get()`). ✓
- No DB creds leave the server → endpoint + `dbmigrate.mjs` hold only token/URL. ✓
- Single implementation shared by endpoint + CLI → `App\Migrator` (Task 1), used by endpoint (Task 3) and `tools/migrate.php` (Task 2). ✓
- Idempotent/backward-compatible migrations → authoring rules (Task 9); ledger + `IF [NOT] EXISTS` convention. ✓
- Per-migration transaction + stop-on-failure → `Migrator::migrate` (Task 1), tested. ✓
- Failure fails the deploy → `dbmigrate.mjs` non-zero exit + `&&` chaining (Tasks 6, 8). ✓
- Dry-run reports pending (read-only, no table creation) → `Migrator::pending` + endpoint `mode=dry-run` (Tasks 1, 3), tested. ✓
- Token auth, `hash_equals`, disabled-when-unset, POST-only → Task 3, verified Task 3 Step 4. ✓
- Staging Basic-Auth exception → Task 7. ✓
- Ship migrations in artifact, hidden via front-controller catch-all (404 verified) → Task 4. ✓
- `migrate.token` config key + pre-flight enforcement → Task 3 Step 1 (pre-flight already enforces key parity). ✓
- `.env` refactor (separate commit) → Task 5. ✓
- Phase 1 = TEST end-to-end → Tasks 1–9; Phase 2 (QA/PROD CI + prod dry-run→apply) intentionally deferred to its own plan after TEST is proven. ✓
- Docs (README rules, CLAUDE.md, staging) → Task 9. ✓

**2. Placeholder scan:** No TBD/TODO. `CHANGE_ME` / `<test-host>` appear only as example config values (matching existing `.env.example`/`config.example.php` conventions), not as plan gaps. All steps show full code or exact commands.

**3. Type consistency:** `Migrator(\mysqli)`, `pending(string): string[]`, `migrate(string): string[]` are identical across Task 1 (definition + tests), Task 2 (CLI wrapper), and Task 3 (endpoint). The endpoint's JSON `{ status, mode, environment, applied, pending }` matches what `dbmigrate.mjs` reads (`body.status`, `body.applied`, `body.pending`) in Task 6. `X-Migrate-Token` header name matches between endpoint (`HTTP_X_MIGRATE_TOKEN`) and trigger (`'X-Migrate-Token'`). `?mode=apply|dry-run` matches between endpoint and trigger.

**Note for the executor:** Task 8's end-to-end step depends on one-time manual server setup (token in `config.php`, overlay re-upload, CI secrets). If those aren't in place when executing, complete the code/commit steps and mark the live end-to-end verification as pending the maintainer's server setup — do not treat it as a code failure.
