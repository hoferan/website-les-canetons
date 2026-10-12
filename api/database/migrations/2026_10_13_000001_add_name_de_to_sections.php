<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A German name for each register, typed in the register editor (#276).
 *
 * `name` stays, and stays the French one: every reader, fixture and earlier
 * migration already keys on it, and it already holds what the committee
 * typed. The German name is optional and falls back to the French one, as
 * for an event tag or a role (ADR 0026), so the seeded registers need none.
 *
 * One small ALTER on a table of six rows, guarded so a re-run does nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('sections', 'name_de')) {
            return;
        }

        Schema::table('sections', function (Blueprint $table) {
            $table->string('name_de', 60)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('sections', 'name_de')) {
            return;
        }

        Schema::table('sections', function (Blueprint $table) {
            $table->dropColumn('name_de');
        });
    }
};
