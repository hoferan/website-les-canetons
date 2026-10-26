<?php

use App\Support\BandTime;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Bookings in the committee inbox (#123, ADR 0035).
 *
 * `booking_changes` is the journal: one row per booking that was made,
 * changed or cancelled. `inbox_reads` holds the committee's shared read
 * marks, keyed by inbox kind so a later source can reuse it.
 *
 * The backfill gives every booking on an event that is not over yet its
 * `new` row. Without it, an event already taking bookings would show no item
 * and wrong counts on the day this ships. Past events get nothing: they never
 * show in the inbox again.
 *
 * SAFE TO RE-RUN. The tables are created only when missing, and the backfill
 * skips bookings that already have a row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('booking_changes')) {
            Schema::create('booking_changes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
                // No foreign key: a cancelled booking's row is gone, and this
                // id is all that is left of it.
                $table->unsignedBigInteger('registration_id')->nullable();
                $table->string('kind', 16);
                $table->foreignId('actor_member_id')->nullable()->constrained('members')->nullOnDelete();
                $table->string('actor_label')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->index(['event_id', 'id']);
            });
        }

        if (! Schema::hasTable('inbox_reads')) {
            Schema::create('inbox_reads', function (Blueprint $table) {
                $table->id();
                $table->string('kind', 32);
                $table->unsignedBigInteger('subject_id');
                $table->unsignedBigInteger('read_up_to');
                $table->foreignId('read_by_member_id')->nullable()->constrained('members')->nullOnDelete();
                $table->string('read_by_label')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->index(['kind', 'subject_id', 'id']);
            });
        }

        $this->backfill();
    }

    public function down(): void
    {
        Schema::dropIfExists('inbox_reads');
        Schema::dropIfExists('booking_changes');
    }

    private function backfill(): void
    {
        $bookings = DB::table('registrations')
            ->join('events', 'events.id', '=', 'registrations.event_id')
            ->whereRaw('COALESCE(events.ends_at, events.starts_at) >= ?', [BandTime::startOfToday()])
            ->whereNotExists(fn ($journal) => $journal->select(DB::raw(1))
                ->from('booking_changes')
                ->whereColumn('booking_changes.registration_id', 'registrations.id'))
            ->orderBy('registrations.created_at')
            ->orderBy('registrations.id')
            ->get([
                'registrations.id',
                'registrations.event_id',
                'registrations.member_id',
                'registrations.first_name',
                'registrations.last_name',
                'registrations.created_at',
            ]);

        foreach ($bookings as $booking) {
            DB::table('booking_changes')->insert([
                'event_id' => $booking->event_id,
                'registration_id' => $booking->id,
                'kind' => 'new',
                'actor_member_id' => $booking->member_id,
                // A guest has no account, so no actor; a member booked their own.
                'actor_label' => $booking->member_id === null
                    ? null
                    : trim("{$booking->first_name} {$booking->last_name}"),
                'created_at' => $booking->created_at,
            ]);
        }
    }
};
