<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who is coming. Replaces the old `responses` table, deleted with the legacy
 * domain in 2026_09_05_000001.
 *
 * TWO STATES, NOT THREE. There is deliberately no "maybe": two buttons, two
 * ≥44px targets, and a chase list that can actually be answered. A third
 * option is what makes "who has not replied?" unanswerable, because half the
 * band settles on it and never comes back.
 *
 * `status` is a plain string with a CHECK-free enum column rather than MySQL's
 * ENUM type: MariaDB 10.3 can alter a VARCHAR without rewriting the table, and
 * the values are validated in the Form Request where the error message can be
 * translated. Stored values are ENGLISH (`yes`/`no`) — the project rule — and
 * the UI reads Oui / Non.
 *
 * `recorded_by_member_id` IS NULL WHEN SELF-ANSWERED and set when somebody
 * holding attendance.record_for_others answered on a member's behalf, so the
 * screen can say "réponse saisie par la direction" rather than implying the
 * member replied. ON DELETE SET NULL, matching audit_log: losing the recorder
 * must never delete the answer, because the answer is what the cook counts.
 *
 * `note` is optional except on one transition — a member changing their OWN
 * answer from yes to no must supply one (decision C11). One column,
 * conditionally required, not a second "reason" column: it is the same
 * sentence either way and the chase list renders it the same.
 *
 * UNIQUE(event_id, member_id) is the backstop that makes PUT an idempotent
 * upsert: tapping Oui then Non cannot race itself into two rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Idempotent, like every migration here: RunPendingMigrations
        // re-checks for pending work on every request, so a partial failure
        // mid-deploy can re-enter this file against a database where the
        // table already exists.
        if (Schema::hasTable('attendance')) {
            return;
        }

        Schema::create('attendance', function (Blueprint $table) {
            $table->id();

            // Both CASCADE: an answer to a deleted event, or from a deleted
            // member, is not a record of anything. DELETE /api/events reports
            // how many went with it rather than letting the deletion be
            // silent — see the R3 spec §4.
            $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
            $table->foreignId('member_id')->constrained('members')->cascadeOnDelete();

            $table->string('status', 16);
            $table->string('note')->nullable();

            $table->foreignId('recorded_by_member_id')
                ->nullable()
                ->constrained('members')
                ->nullOnDelete();

            $table->timestamps();

            $table->unique(['event_id', 'member_id']);

            // The chase list reads every answer for one event, and
            // GET /api/events joins the caller's own answers across all of
            // them. The unique index above already covers (event_id, …); this
            // one serves the second query.
            $table->index('member_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance');
    }
};
