<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Forms for members only (#318, ADR 0034).
 *
 * `events.registration_audience` says who may fill in the form, `public` for
 * every form there is today. A member's booking lives in `registrations` like
 * a guest's, with `member_id` set and no email or phone, so those two become
 * nullable. One booking per member per event is a unique index; guests have
 * a null `member_id`, and NULLs never collide.
 *
 * The member key is nulled when the account is deleted, so the booking keeps
 * the name it was made under.
 *
 * SAFE TO RE-RUN. Each step checks for what it adds; making a column
 * nullable twice changes nothing.
 */
return new class extends Migration
{
    private const UNIQUE = 'registrations_event_member_unique';

    public function up(): void
    {
        if (! Schema::hasColumn('events', 'registration_audience')) {
            Schema::table('events', function (Blueprint $table) {
                $table->string('registration_audience', 16)->default('public')->after('registration_asks_table');
            });
        }

        if (! Schema::hasColumn('registrations', 'member_id')) {
            Schema::table('registrations', function (Blueprint $table) {
                $table->foreignId('member_id')->nullable()->after('event_id')
                    ->constrained('members')->nullOnDelete();
            });
        }

        Schema::table('registrations', function (Blueprint $table) {
            $table->string('email')->nullable()->change();
            $table->string('phone')->nullable()->change();
        });

        if (! Schema::hasIndex('registrations', self::UNIQUE)) {
            Schema::table('registrations', function (Blueprint $table) {
                $table->unique(['event_id', 'member_id'], self::UNIQUE);
            });
        }
    }

    public function down(): void
    {
        // email and phone stay nullable: a member's booking may hold nulls
        // there by now, and NOT NULL would refuse the rollback.
        if (Schema::hasIndex('registrations', self::UNIQUE)) {
            Schema::table('registrations', function (Blueprint $table) {
                $table->dropUnique(self::UNIQUE);
            });
        }

        if (Schema::hasColumn('registrations', 'member_id')) {
            Schema::table('registrations', function (Blueprint $table) {
                $table->dropConstrainedForeignId('member_id');
            });
        }

        if (Schema::hasColumn('events', 'registration_audience')) {
            Schema::table('events', function (Blueprint $table) {
                $table->dropColumn('registration_audience');
            });
        }
    }
};
