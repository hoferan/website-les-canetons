<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\ForeignKeyDefinition;
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
 * answer from yes to no must supply one (ADR 0018). One column,
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
        // ONE GUARD PER STATEMENT, as in 2026_10_02_000002. MariaDB commits
        // the CREATE TABLE and each ALTER that adds a key or an index on its
        // own, so a run cut off in between leaves a table without them, and a
        // guard on the table alone would skip them for good.
        if (! Schema::hasTable('attendance')) {
            Schema::create('attendance', function (Blueprint $table) {
                $table->id();
                $table->foreignId('event_id');
                $table->foreignId('member_id');
                $table->string('status', 16);
                $table->string('note')->nullable();
                $table->foreignId('recorded_by_member_id')->nullable();
                $table->timestamps();
            });
        }

        // The indexes come before the foreign keys, so each key rests on one
        // of them instead of MariaDB making an index of its own.
        if (! Schema::hasIndex('attendance', ['event_id', 'member_id'], 'unique')) {
            Schema::table('attendance', function (Blueprint $table) {
                $table->unique(['event_id', 'member_id']);
            });
        }

        // The chase list reads every answer for one event, and
        // GET /api/events joins the caller's own answers across all of them.
        // The unique index above already covers (event_id, …); this one serves
        // the second query.
        if (! Schema::hasIndex('attendance', ['member_id'])) {
            Schema::table('attendance', function (Blueprint $table) {
                $table->index('member_id');
            });
        }

        // Both CASCADE: an answer to a deleted event, or from a deleted
        // member, is not a record of anything. DELETE /api/events reports how
        // many went with it rather than letting the deletion be silent.
        $this->foreignKey('event_id', 'events', fn (ForeignKeyDefinition $key) => $key->cascadeOnDelete());
        $this->foreignKey('member_id', 'members', fn (ForeignKeyDefinition $key) => $key->cascadeOnDelete());
        $this->foreignKey('recorded_by_member_id', 'members', fn (ForeignKeyDefinition $key) => $key->nullOnDelete());
    }

    /**
     * Adds the key on $column unless one is there already.
     *
     * @param  Closure(ForeignKeyDefinition): mixed  $onDelete
     */
    private function foreignKey(string $column, string $references, Closure $onDelete): void
    {
        foreach (Schema::getForeignKeys('attendance') as $key) {
            if ($key['columns'] === [$column]) {
                return;
            }
        }

        Schema::table('attendance', function (Blueprint $table) use ($column, $references, $onDelete) {
            $onDelete($table->foreign($column)->references('id')->on($references));
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance');
    }
};
