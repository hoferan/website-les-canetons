<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paid and unpaid, for the guest list (#115).
 *
 * `paid_at IS NULL` means unpaid, and nothing else stores the state: a
 * boolean beside a date is a flag that drifts out of step with it, the same
 * reason `registration_closes_at` is the enable switch on events.
 *
 * NO MEMBER COLUMN, unlike `contact_messages.handled_by_member_id`. Money at
 * a souper is taken at the door by whoever is standing there, and the audit
 * log already names who pressed the button.
 *
 * Guarded because RunPendingMigrations re-checks on every request.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('registrations', 'paid_at')) {
            Schema::table('registrations', function (Blueprint $table) {
                $table->timestamp('paid_at')->nullable()->after('table_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('registrations', 'paid_at')) {
            Schema::table('registrations', function (Blueprint $table) {
                $table->dropColumn('paid_at');
            });
        }
    }
};
