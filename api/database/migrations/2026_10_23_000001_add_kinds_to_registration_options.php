<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Turns an event's options into the blocks of a form (#114, ADR 0032).
 *
 * Every existing option is a souper menu, so it becomes a `quantity` that
 * counts people and is not required: the booking form, the per-booking cap
 * and the totals behave as before. `counts_guests` defaults to true for that
 * reason, so the ADD fills every existing row in the same statement and no
 * separate backfill can be skipped. New blocks get their value from the API,
 * which writes it explicitly.
 *
 * `label` becomes nullable for a paragraph without a title, and
 * `description` widens to text for a paragraph's body. A choice row's
 * `quantity` becomes nullable and gains `value`, for the answers that are not
 * a number. All of it is additive, so code from before this deploy keeps
 * working.
 *
 * SAFE TO RE-RUN, and safe to finish after a run that died halfway: MariaDB
 * DDL is not transactional and each column is its own ALTER, so each one is
 * guarded on its own. The two widenings re-run harmlessly.
 */
return new class extends Migration
{
    public function up(): void
    {
        $columns = [
            'kind' => fn (Blueprint $table) => $table->string('kind', 16)->default('quantity')->after('event_id'),
            'required' => fn (Blueprint $table) => $table->boolean('required')->default(false)->after('description'),
            'counts_guests' => fn (Blueprint $table) => $table->boolean('counts_guests')->default(true)->after('required'),
            'settings' => fn (Blueprint $table) => $table->json('settings')->nullable()->after('capacity'),
        ];

        foreach ($columns as $column => $add) {
            if (! Schema::hasColumn('event_registration_options', $column)) {
                Schema::table('event_registration_options', $add);
            }
        }

        Schema::table('event_registration_options', function (Blueprint $table) {
            $table->string('label')->nullable()->change();
            $table->text('description')->nullable()->change();
        });

        Schema::table('registration_choices', function (Blueprint $table) {
            $table->unsignedInteger('quantity')->nullable()->change();
        });

        if (! Schema::hasColumn('registration_choices', 'value')) {
            Schema::table('registration_choices', function (Blueprint $table) {
                $table->text('value')->nullable()->after('quantity');
            });
        }
    }

    /** Drops the added columns. The widened ones stay wide, which is harmless. */
    public function down(): void
    {
        if (Schema::hasColumn('registration_choices', 'value')) {
            Schema::table('registration_choices', function (Blueprint $table) {
                $table->dropColumn('value');
            });
        }

        foreach (['kind', 'required', 'counts_guests', 'settings'] as $column) {
            if (Schema::hasColumn('event_registration_options', $column)) {
                Schema::table('event_registration_options', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }
    }
};
