<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * The rebuild carries no data forward (ADR 0015), so the old domain's
 * tables are dropped rather than adopted or migrated.
 *
 * Order matters: children before parents, because responses and users hold
 * foreign keys into events, instruments and each other. dropIfExists is used so
 * a fresh database (which never had these) migrates cleanly too.
 *
 * contact_messages is deliberately NOT dropped — it survives the rebuild
 * unchanged.
 */
return new class extends Migration
{
    private const REBUILT_EVENTS = '2026_09_09_000001_create_events_table';

    public function up(): void
    {
        Schema::dropIfExists('responses');
        Schema::dropIfExists('signups');

        // The rebuild's own table is called `events` too. Once its migration
        // has run, the table here is the live one, so a second run of this
        // file must leave it alone (#422).
        if (! in_array(self::REBUILT_EVENTS, app('migration.repository')->getRan(), true)) {
            Schema::dropIfExists('events');
        }

        Schema::dropIfExists('users');
        Schema::dropIfExists('instruments');
    }

    public function down(): void
    {
        // Irreversible by design: these tables are gone for good, and
        // recreating empty ones would be a lie about what down() restores.
    }
};
