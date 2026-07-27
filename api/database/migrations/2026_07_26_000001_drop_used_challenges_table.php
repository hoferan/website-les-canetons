<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * The Altcha replay guard moved to Laravel's cache (App\Support\ChallengeGuard),
 * where Cache::add() gives the same atomic single-use semantics and entries
 * expire on their own. This table is no longer read or written.
 *
 * The create-or-adopt migration that made it (2026_07_23_000005) stays: it has
 * already run on every server and is recorded in the `migrations` table by
 * filename, so deleting the file would not un-apply it and would break
 * `migrate:status`. On a fresh database it creates the table and this migration
 * then drops it, which is harmless.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('used_challenges');
    }

    public function down(): void
    {
        // Deliberately irreversible: recreating an empty replay-guard table
        // would provide no protection for challenges already in flight — every
        // signature solved before the rollback would look unused again, so a
        // "restoring" down() is strictly worse than leaving the table dropped.
        // The guard itself lives in the cache now and needs nothing here.
    }
};
