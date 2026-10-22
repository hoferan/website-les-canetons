<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How many of an option can be booked in all (#114, ADR 0031).
 *
 * Null is no limit, which is every existing option, so nothing is backfilled
 * and the code before this deploy keeps working against the new column.
 *
 * SAFE TO RE-RUN. The column is added only when missing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('event_registration_options', 'capacity')) {
            Schema::table('event_registration_options', function (Blueprint $table) {
                $table->unsignedInteger('capacity')->nullable()->after('price_cents');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('event_registration_options', 'capacity')) {
            Schema::table('event_registration_options', function (Blueprint $table) {
                $table->dropColumn('capacity');
            });
        }
    }
};
