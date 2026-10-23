<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Turns an event's options into the blocks of a form (#114, ADR 0032).
 *
 * Every existing option is a souper menu, so it becomes a `quantity` that
 * counts people and is not required: the booking form, the per-booking cap
 * and the totals behave as before. The backfill runs only when the column is
 * first added, so a re-run cannot undo a committee's later untick.
 *
 * `label` becomes nullable for a paragraph without a title, and
 * `description` widens to text for a paragraph's body. A choice row's
 * `quantity` becomes nullable and gains `value`, for the answers that are not
 * a number. Both are additive, so code from before this deploy keeps working.
 *
 * SAFE TO RE-RUN. Each column is added or changed only when it is missing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('event_registration_options', 'kind')) {
            Schema::table('event_registration_options', function (Blueprint $table) {
                $table->string('kind', 16)->default('quantity')->after('event_id');
                $table->boolean('required')->default(false)->after('description');
                $table->boolean('counts_guests')->default(false)->after('required');
                $table->json('settings')->nullable()->after('capacity');
                $table->string('label')->nullable()->change();
                $table->text('description')->nullable()->change();
            });

            DB::table('event_registration_options')->update(['counts_guests' => true]);
        }

        if (! Schema::hasColumn('registration_choices', 'value')) {
            Schema::table('registration_choices', function (Blueprint $table) {
                $table->unsignedInteger('quantity')->nullable()->change();
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

        if (Schema::hasColumn('event_registration_options', 'kind')) {
            Schema::table('event_registration_options', function (Blueprint $table) {
                $table->dropColumn(['kind', 'required', 'counts_guests', 'settings']);
            });
        }
    }
};
