# Schema Timestamp Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize `created_at`/`updated_at` across the application tables so every non-framework table has consistent audit timestamps: add `events.updated_at`, `responses.updated_at`, and the missing `instruments.created_at`.

**Architecture:** The `lescanetons` DB is shared between the old vanilla-PHP app (raw mysqli) and the Laravel API. Following this repo's established pattern (e.g. `contact_messages` lives in *both* `docker/db/init/01-schema.sql` and a Laravel adopt-migration), every schema change lands in **two** places: `01-schema.sql` (source for fresh dev DBs and the old-app `lescanetons_test`) and an idempotent Laravel adopt-migration (reconciles existing shared DBs, and is the only schema source for `laravel_api_test`).

**Tech Stack:** PHP 8.4, MariaDB 10.3, Laravel 13 (Eloquent migrations + PHPUnit/RefreshDatabase), old-app PHPUnit integration tests.

## Scope note — public_id deferred

An earlier revision of this plan also added an anonymous `public_id` (ULID) to `users` and `responses`. That was **dropped** after review: no user/response integer ID is exposed to any client today, `username` already serves as a non-sequential handle for users, and a `responses.public_id` would have no consumer at all. `public_id` is deferred to **sub-project 2b** and, if added then, scoped to `users` only and generated Laravel-side (`Str::ulid()` / `HasUlids`) — no `symfony/uid` dependency in the old app, no reference-table UIDs. See the `public-id-ulid-decision` memory for the full rationale.

## Global Constraints

- **PHP 8.4**, **MariaDB 10.3** — match prod; migrations may use MariaDB-specific features.
- **English everywhere** for identifiers/columns; French only for user-visible UI (not touched here).
- **Migrations idempotent + backward-compatible** — guard every adopt-migration with `Schema::hasTable`/`Schema::hasColumn`; new `updated_at`/`created_at` columns are **nullable** (or `useCurrent`) so pre-existing old-app INSERTs that don't name them keep working.
- Two test suites must stay green: `npm run test:php` (old app → `lescanetons_test`) and the Laravel suite (`api/` → `laravel_api_test`).

---

## File Structure

- `docker/db/init/01-schema.sql` (MODIFY) — add columns to `instruments`, `events`, `responses` CREATE statements (fresh-DB + old-app-test source of truth).
- `api/database/migrations/2026_07_23_000006_create_events_table.php` (CREATE) — adopt `events`, add `updated_at`.
- `api/database/migrations/2026_07_23_000007_create_responses_table.php` (CREATE) — adopt `responses`, add `updated_at`.
- `api/database/migrations/2026_07_24_000001_add_created_at_to_instruments.php` (CREATE) — corrective for existing shared DBs.
- `api/tests/Feature/SchemaTimestampsMigrationTest.php` (CREATE) — column presence assertions.

**Migration ordering note:** `events` (000006) must precede `responses` (000007) because the `responses` create-branch FKs `event_id → events.id`; both follow `users` (000002) and `instruments` (000001). The `2026_07_24_*` corrective runs last. On a fresh `laravel_api_test` the create-branches build the tables with `$table->id()` (bigint) + `foreignId(...)->constrained()`, mirroring the existing `instruments`/`users` adopt-migrations; on the shared DB the create-branch is skipped and only the guarded `ADD COLUMN`s run.

---

### Task 1: `events.updated_at`

**Files:**
- Modify: `docker/db/init/01-schema.sql` (the `CREATE TABLE \`events\`` block)
- Create: `api/database/migrations/2026_07_23_000006_create_events_table.php`
- Test: `api/tests/Feature/SchemaTimestampsMigrationTest.php`

**Interfaces:**
- Produces: `events` table (both schema sources) with an `updated_at TIMESTAMP NULL` column. Consumed by Task 2 (`responses.event_id` FK) and the shared schema test.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/SchemaTimestampsMigrationTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SchemaTimestampsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_events_table_has_timestamps(): void
    {
        $this->assertTrue(Schema::hasTable('events'));
        $this->assertTrue(Schema::hasColumns('events', [
            'id', 'date', 'title', 'start_time', 'end_time',
            'location', 'attire', 'weekend', 'created_at', 'updated_at',
        ]));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && php artisan test --filter=test_events_table_has_timestamps`
Expected: FAIL — `events` table does not exist in `laravel_api_test` (no migration creates it yet).

- [ ] **Step 3: Create the events adopt-migration**

Create `api/database/migrations/2026_07_23_000006_create_events_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('events')) {
            Schema::create('events', function (Blueprint $table) {
                $table->id();
                $table->date('date');
                $table->string('title');
                $table->time('start_time');
                $table->time('end_time');
                $table->string('location');
                $table->string('attire')->nullable();
                $table->boolean('weekend')->default(false);
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
            });
            return;
        }

        // Table already exists (old app / 01-schema.sql) — adopt it: add the
        // one column it's missing, leave everything else untouched.
        if (!Schema::hasColumn('events', 'updated_at')) {
            Schema::table('events', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('events');
    }
};
```

- [ ] **Step 4: Add `updated_at` to the base schema**

In `docker/db/init/01-schema.sql`, edit the `events` table so the `created_at` line is followed by an `updated_at` line:

```sql
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && php artisan test --filter=test_events_table_has_timestamps`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/database/migrations/2026_07_23_000006_create_events_table.php \
        api/tests/Feature/SchemaTimestampsMigrationTest.php \
        docker/db/init/01-schema.sql
git commit -m "feat(api): adopt events table and add updated_at"
```

---

### Task 2: `responses.updated_at`

**Files:**
- Modify: `docker/db/init/01-schema.sql` (the `CREATE TABLE \`responses\`` block)
- Create: `api/database/migrations/2026_07_23_000007_create_responses_table.php`
- Test: `api/tests/Feature/SchemaTimestampsMigrationTest.php` (add method)

**Interfaces:**
- Consumes: `events` (Task 1), `users` (existing migration 000002).
- Produces: `responses` table with `updated_at TIMESTAMP NULL`.

- [ ] **Step 1: Write the failing test**

Add to `SchemaTimestampsMigrationTest`:

```php
    public function test_responses_table_has_timestamps(): void
    {
        $this->assertTrue(Schema::hasTable('responses'));
        $this->assertTrue(Schema::hasColumns('responses', [
            'id', 'user_id', 'event_id', 'answer', 'created_at', 'updated_at',
        ]));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && php artisan test --filter=test_responses_table_has_timestamps`
Expected: FAIL — `responses` table does not exist in `laravel_api_test`.

- [ ] **Step 3: Create the responses adopt-migration**

Create `api/database/migrations/2026_07_23_000007_create_responses_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('responses')) {
            Schema::create('responses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
                $table->enum('answer', ['participate', 'notparticipate']);
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
                $table->unique(['user_id', 'event_id'], 'uq_response');
            });
            return;
        }

        // Table already exists (old app / 01-schema.sql) — adopt it: add the
        // one column it's missing, leave everything else untouched.
        if (!Schema::hasColumn('responses', 'updated_at')) {
            Schema::table('responses', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('responses');
    }
};
```

- [ ] **Step 4: Add `updated_at` to the base schema**

In `docker/db/init/01-schema.sql`, edit the `responses` table so the `created_at` line is followed by an `updated_at` line (keep the existing `uq_response` unique key and the `fk_resp_event`/`fk_resp_user` constraints):

```sql
  `answer` enum('participate','notparticipate') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && php artisan test --filter=SchemaTimestampsMigrationTest`
Expected: PASS (events + responses methods).

- [ ] **Step 6: Commit**

```bash
git add api/database/migrations/2026_07_23_000007_create_responses_table.php \
        api/tests/Feature/SchemaTimestampsMigrationTest.php \
        docker/db/init/01-schema.sql
git commit -m "feat(api): adopt responses table and add updated_at"
```

---

### Task 3: `instruments.created_at` (corrective)

**Files:**
- Modify: `docker/db/init/01-schema.sql` (the `CREATE TABLE \`instruments\`` block)
- Create: `api/database/migrations/2026_07_24_000001_add_created_at_to_instruments.php`
- Test: `api/tests/Feature/SchemaTimestampsMigrationTest.php` (add method)

**Interfaces:**
- Produces: `instruments.created_at` present in every environment (fixes the anomaly where the shared DB had only `updated_at`).

- [ ] **Step 1: Write the test**

Add to `SchemaTimestampsMigrationTest`:

```php
    public function test_instruments_table_has_created_at(): void
    {
        $this->assertTrue(Schema::hasColumns('instruments', ['id', 'name', 'created_at', 'updated_at']));
    }
```

- [ ] **Step 2: Run test**

Run: `cd api && php artisan test --filter=test_instruments_table_has_created_at`
Expected: PASS on `laravel_api_test` — the existing `create_instruments` migration's create-branch already adds `created_at`. This test regression-guards the anomaly; the migration in Step 3 is what repairs already-migrated *shared* DBs, which this test suite cannot observe.

- [ ] **Step 3: Create the corrective migration**

Create `api/database/migrations/2026_07_24_000001_add_created_at_to_instruments.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The old schema created `instruments` with neither timestamp; the
        // original adopt-migration only added `updated_at`, leaving already-
        // migrated shared DBs without `created_at`. Repair that here.
        if (Schema::hasTable('instruments') && !Schema::hasColumn('instruments', 'created_at')) {
            Schema::table('instruments', function (Blueprint $table) {
                $table->timestamp('created_at')->useCurrent();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('instruments', 'created_at')) {
            Schema::table('instruments', function (Blueprint $table) {
                $table->dropColumn('created_at');
            });
        }
    }
};
```

- [ ] **Step 4: Add `created_at` to the base schema**

In `docker/db/init/01-schema.sql`, edit the `instruments` table:

```sql
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && php artisan test --filter=test_instruments_table_has_created_at`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/database/migrations/2026_07_24_000001_add_created_at_to_instruments.php \
        api/tests/Feature/SchemaTimestampsMigrationTest.php \
        docker/db/init/01-schema.sql
git commit -m "fix(api): add missing created_at to instruments"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Recreate the local DBs from the updated base schema**

The `db_data` volume persists the old schema, so a plain restart won't re-run `01-schema.sql`. Recreate it:

```bash
docker compose down -v
docker compose up -d --build
```

Expected: `migrate` and `api-migrate` services complete successfully; `web` starts.

- [ ] **Step 2: Verify the shared DB schema**

Run:

```bash
docker compose exec db mysql -ucanetons -pcanetons lescanetons -e "
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='lescanetons'
    AND ((table_name='instruments' AND column_name='created_at')
      OR (table_name='events'      AND column_name='updated_at')
      OR (table_name='responses'   AND column_name='updated_at'))
  ORDER BY table_name, column_name;"
```

Expected: all 3 rows present.

- [ ] **Step 3: Run both test suites**

Run: `npm run test:php`
Expected: PASS.

Run: `cd api && php artisan test`
Expected: PASS.

- [ ] **Step 4: Run the full check**

Run: `npm run check`
Expected: lint/format pass.

---

## Self-Review

- **Spec coverage:** Timestamps standardized on all three tables missing a column — `events.updated_at` (Task 1), `responses.updated_at` (Task 2), `instruments.created_at` (Task 3). `public_id` intentionally out of scope (deferred to 2b — see scope note). ✓
- **Dual schema source:** every column lands in both `01-schema.sql` and a Laravel migration (Tasks 1-3), matching the `contact_messages` precedent. ✓
- **Type consistency:** new columns are `timestamp NULL` (`updated_at`) or `timestamp ... useCurrent` (`created_at`); migration filenames order `events`(000006) < `responses`(000007) < corrective(000024_1), satisfying the `responses`→`events`/`users` FK dependency. ✓
- **Backward-compat:** all new columns nullable / defaulted; adopt-migrations guarded by `hasTable`/`hasColumn`; no old-app code change required (the old app does not need to write these columns — they mirror the existing nullable `contact_messages.updated_at`, which the old app also leaves untouched). ✓
- **No placeholders:** every code/SQL step shows complete content. ✓
