<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Public registration — the souper, generalised.
 *
 * REGISTRATION IS A PROPERTY OF AN EVENT (decision D9), not a separate
 * feature. That is what retires `Occasion` with its MENU_VALUES /
 * MENU_LABELS / MENU_INFO lockstep, `ACTIVE_OCCASION`,
 * `SOUPER_SIGNUP_ENABLED` and the conditional route registration: next
 * year's souper becomes a form the committee fills in rather than a deploy.
 *
 * REGISTRATION IS ENABLED IFF `registration_closes_at IS NOT NULL`. No
 * separate boolean, deliberately — a flag beside a date is a flag that
 * drifts out of step with it, and this schema has already retired one
 * (`weekend`) for exactly that reason.
 *
 * These are the columns the events migration named as "deliberately absent:
 * the registration_* columns (a later release owns them)". This is that
 * release.
 *
 * NO CAPACITY COLUMN (decision G1). The old souper had no capacity check
 * either, and adding one puts a count-then-insert race on the single
 * endpoint strangers can hammer. `registration_max_guests` is a per-BOOKING
 * cap — the old MAX_GUESTS — not a total.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Idempotent, like every migration here: RunPendingMigrations
        // re-checks for pending work on every request, so a partial failure
        // mid-deploy can re-enter this file. Each step guards itself rather
        // than the file guarding on one table, because a failure between the
        // four creates would otherwise leave the rest unreachable.
        if (! Schema::hasColumn('events', 'registration_closes_at')) {
            Schema::table('events', function (Blueprint $table) {
                // NULL = open as soon as closes_at is set. It exists so the
                // committee can prepare an event whose form is not yet live.
                $table->dateTime('registration_opens_at')->nullable()->after('is_public');

                // THE ENABLE SWITCH.
                $table->dateTime('registration_closes_at')->nullable()->after('registration_opens_at');

                // Per booking, not per event.
                $table->unsignedInteger('registration_max_guests')->nullable()->after('registration_closes_at');
            });
        }

        if (! Schema::hasTable('event_registration_options')) {
            Schema::create('event_registration_options', function (Blueprint $table) {
                $table->id();
                $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
                $table->string('label');
                $table->string('description')->nullable();

                // INTEGER CENTIMES, never a decimal and never a float: 4500
                // is CHF 45.-. Binary floating point cannot represent 0.1
                // exactly, and money that is off by a rappen in the tenth row
                // is money the committee reconciles by hand. Nullable, so a
                // free option — or one whose price lives in the description —
                // is expressible without inventing a zero that means
                // "unknown".
                $table->unsignedInteger('price_cents')->nullable();

                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();

                $table->index(['event_id', 'sort_order']);
            });
        }

        if (! Schema::hasTable('registrations')) {
            Schema::create('registrations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();

                // Name, email and phone required (G4): a Swiss committee
                // reaches somebody by phone the evening before, and every
                // required field beyond that is a reason to abandon the form.
                $table->string('first_name');
                $table->string('last_name');
                $table->string('email');
                $table->string('phone');

                $table->string('address')->nullable();
                $table->string('table_name')->nullable();

                $table->timestamps();

                $table->index('event_id');
            });
        }

        if (! Schema::hasTable('registration_choices')) {
            Schema::create('registration_choices', function (Blueprint $table) {
                $table->id();

                $table->foreignId('registration_id')
                    ->constrained('registrations')
                    ->cascadeOnDelete();

                // RESTRICT, NOT CASCADE, and the asymmetry with the line
                // above is the point. Deleting a booking should take its
                // choices — they mean nothing alone. Deleting an OPTION that
                // people have already booked would silently rewrite what
                // those people ordered, so it is refused instead and the
                // committee is told which option is in use.
                $table->foreignId('option_id')
                    ->constrained('event_registration_options')
                    ->restrictOnDelete();

                $table->unsignedInteger('quantity');
                $table->timestamps();

                // "3 x meat" is ONE row carrying a quantity, not three rows.
                // That is what makes a total a SUM rather than a COUNT over a
                // text column, which is what the old signups.menus was.
                $table->unique(['registration_id', 'option_id']);
            });
        }
    }

    /**
     * Dropped in dependency order — choices before options and registrations,
     * both before the events columns — because RESTRICT means the database
     * will refuse the other way round.
     */
    public function down(): void
    {
        Schema::dropIfExists('registration_choices');
        Schema::dropIfExists('registrations');
        Schema::dropIfExists('event_registration_options');

        if (Schema::hasColumn('events', 'registration_closes_at')) {
            Schema::table('events', function (Blueprint $table) {
                $table->dropColumn([
                    'registration_opens_at',
                    'registration_closes_at',
                    'registration_max_guests',
                ]);
            });
        }
    }
};
