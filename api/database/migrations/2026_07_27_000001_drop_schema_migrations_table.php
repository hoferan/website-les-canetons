<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Despite the name, this is NOT Laravel's migration history. Laravel's own
 * ledger is the separate `migrations` table and is untouched by this file.
 *
 * `schema_migrations` was App\Migrator's ledger for the old app's numbered
 * `sql/migrations/*.sql` files — one row per applied file (`version`,
 * `applied_at`). App\Migrator, App\AutoMigrator and every one of those .sql
 * files are deleted; nothing in the tree reads or writes this table any more.
 * It survives only on servers that ran the old system, holding two rows for
 * `001_create_signups` and `002_create_used_challenges` — both naming files
 * that no longer exist. Dropping it removes the last trace of that system.
 *
 * Fresh databases (local, CI) never had it, so `dropIfExists` is a clean no-op
 * there; only the real servers have anything to drop.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('schema_migrations');
    }

    public function down(): void
    {
        // Deliberately irreversible: recreating an empty ledger would be worse
        // than leaving it dropped. A ledger's whole meaning is which files it
        // records as applied, and an empty one asserts the opposite of the
        // truth — the old migrator would read it and conclude that nothing had
        // ever been applied, then re-run every migration from scratch against a
        // database that already has those tables. There is no migrator left to
        // read it in any case, so restoring it would serve nobody.
    }
};
