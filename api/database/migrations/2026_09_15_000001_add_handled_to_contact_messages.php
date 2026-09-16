<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Open and handled, for the committee inbox.
 *
 * `handled_at IS NULL` is the whole definition of an open item — the inbox is
 * computed from its sources rather than materialised, so this column is the
 * only state it has.
 *
 * WHY THE MEMBER IS RECORDED. The state is shared: one person answers a
 * prestation enquiry on the band's behalf, so marking it handled marks it for
 * everybody. Shared state with no author answers the wrong question, though —
 * "has anybody dealt with this" matters much less than "who replied" — and
 * nullOnDelete keeps that answer readable after a member leaves the band.
 *
 * Guarded because RunPendingMigrations re-checks on every request.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('contact_messages', 'handled_at')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->timestamp('handled_at')->nullable();
            });
        }

        if (! Schema::hasColumn('contact_messages', 'handled_by_member_id')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->foreignId('handled_by_member_id')
                    ->nullable()
                    ->constrained('members')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('contact_messages', 'handled_by_member_id')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->dropConstrainedForeignId('handled_by_member_id');
            });
        }

        if (Schema::hasColumn('contact_messages', 'handled_at')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->dropColumn('handled_at');
            });
        }
    }
};
