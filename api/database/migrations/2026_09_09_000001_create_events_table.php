<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The planning: rehearsals and gigs the committee enters and members answer
 * for. Replaces the old date + two TIME columns + `weekend` boolean.
 *
 * `starts_at`/`ends_at` as a datetime PAIR is what dissolves `weekend`
 * (decision C6): a multi-day event is simply one whose start and end fall on
 * different days, so there is no flag to keep in step with the dates. The live
 * planning has "Weekend musical, 3-4 October", which the old schema could not
 * express as a single row. `ends_at` is NOT NULL so that fact stays true —
 * a nullable end would let a row drift back into needing a separate flag.
 *
 * `is_public` defaults to FALSE. The live site has a real defect where the
 * rehearsal planning (/planning_repet) is visible to strangers; nothing reads
 * this column yet, but when something does, the accident can only fall the
 * safe way.
 *
 * Deliberately absent: `attendance_enabled` (every event in this system needs
 * an answer, so the flag has no case) and the `registration_*` columns (a
 * later release owns them).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Idempotent, like every migration here: App\Http\Middleware\
        // RunPendingMigrations re-checks for pending work on every request, so
        // a partial failure mid-deploy can re-enter this file against a
        // database where `events` already exists. Guard first rather than
        // let Schema::create fail on a table that is already there.
        if (Schema::hasTable('events')) {
            return;
        }

        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->string('location');
            $table->string('attire')->nullable();
            $table->boolean('is_public')->default(false);
            $table->text('notes')->nullable();
            $table->timestamps();

            // Every query in this plan orders or filters by it, and the
            // planning is the most-loaded screen the band has.
            $table->index('starts_at');
        });
    }

    /**
     * Drops the table outright. Nothing points at `events` yet — R1c-2's
     * `attendance` will, with ON DELETE CASCADE.
     */
    public function down(): void
    {
        Schema::dropIfExists('events');
    }
};
