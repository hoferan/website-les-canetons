<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How many seats a table has at an event, so the booking form can show how
 * full each table is (#327).
 *
 * Null shows no seats, which is every existing event, so nothing is backfilled
 * and the code before this deploy keeps working against the new column.
 *
 * SAFE TO RE-RUN. The column is added only when missing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('events', 'registration_table_seats')) {
            Schema::table('events', function (Blueprint $table) {
                $table->unsignedTinyInteger('registration_table_seats')->nullable()->after('registration_asks_table');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('events', 'registration_table_seats')) {
            Schema::table('events', function (Blueprint $table) {
                $table->dropColumn('registration_table_seats');
            });
        }
    }
};
