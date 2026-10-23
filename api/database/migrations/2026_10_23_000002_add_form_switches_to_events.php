<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A booking form's own switches (#114, ADR 0033): whether it is open at all,
 * and whether it asks for an address and a table.
 *
 * `registration_enabled` is added with a default of true, so the ADD itself
 * keeps every form that takes bookings today taking them, in one statement
 * with no backfill to skip. The default then drops to false, so a new form
 * starts closed. That second step re-runs harmlessly, and a run that died
 * between the two leaves only the default to fix, which the next run does.
 *
 * The two `asks` columns default to true, which is what every form did.
 *
 * SAFE TO RE-RUN. Each column is added only when it is missing.
 */
return new class extends Migration
{
    public function up(): void
    {
        $columns = [
            'registration_enabled' => fn (Blueprint $table) => $table->boolean('registration_enabled')->default(true)->after('registration_max_guests'),
            'registration_asks_address' => fn (Blueprint $table) => $table->boolean('registration_asks_address')->default(true)->after('registration_enabled'),
            'registration_asks_table' => fn (Blueprint $table) => $table->boolean('registration_asks_table')->default(true)->after('registration_asks_address'),
        ];

        foreach ($columns as $column => $add) {
            if (! Schema::hasColumn('events', $column)) {
                Schema::table('events', $add);
            }
        }

        Schema::table('events', function (Blueprint $table) {
            $table->boolean('registration_enabled')->default(false)->change();
        });
    }

    public function down(): void
    {
        foreach (['registration_asks_table', 'registration_asks_address', 'registration_enabled'] as $column) {
            if (Schema::hasColumn('events', $column)) {
                Schema::table('events', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }
    }
};
