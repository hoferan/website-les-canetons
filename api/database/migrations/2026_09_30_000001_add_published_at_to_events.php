<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Draft events: an event that exists and is editable but has not been shown to
 * the band yet.
 *
 * `published_at` is the whole state. Null is a draft, a timestamp is a
 * published event. It is independent of `is_public`, which only decides
 * whether strangers see a published event on the agenda.
 *
 * A draft may be incomplete, so `starts_at`, `ends_at` and `location` become
 * nullable. `title` stays NOT NULL because it is what names a draft in a list.
 * The guarantee that `ends_at` was made NOT NULL for (a multi-day event is one
 * whose start and end fall on different days, so no `weekend` flag can come
 * back) moves up to the publish path: a published event always has both dates.
 *
 * The backfill sets `published_at = created_at` so every existing row stays
 * published through the deploy. It runs only in the same step that adds the
 * column. RunPendingMigrations can re-enter this file after a partial failure,
 * and a backfill on every entry would publish every draft written since.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('events', 'published_at')) {
            Schema::table('events', function (Blueprint $table) {
                $table->dateTime('published_at')->nullable()->after('notes');
            });

            DB::table('events')->update(['published_at' => DB::raw('created_at')]);
        }

        // Re-stating a column as nullable is harmless to repeat.
        Schema::table('events', function (Blueprint $table) {
            $table->dateTime('starts_at')->nullable()->change();
            $table->dateTime('ends_at')->nullable()->change();
            $table->string('location')->nullable()->change();
        });
    }

    /**
     * Drops only the column. The NOT NULLs are not restored: by the time
     * anyone rolls back, drafts with no date may exist, and forcing the
     * constraint back would fail on them.
     */
    public function down(): void
    {
        if (Schema::hasColumn('events', 'published_at')) {
            Schema::table('events', function (Blueprint $table) {
                $table->dropColumn('published_at');
            });
        }
    }
};
