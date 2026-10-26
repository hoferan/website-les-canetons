<?php

namespace Tests\Feature;

use App\Models\BookingChange;
use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Support\BookingChangeKind;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The booking journal and the inbox read marks (#123, ADR 0035), and the
 * backfill that gives bookings made before the journal existed their `new`
 * row, so an event already taking bookings shows up with honest counts.
 */
class BookingJournalSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_tables_exist_after_migrate(): void
    {
        $this->assertTrue(Schema::hasTable('booking_changes'));
        $this->assertTrue(Schema::hasTable('inbox_reads'));
    }

    public function test_running_twice_changes_nothing(): void
    {
        Registration::factory()->create();
        $this->forgetJournal();

        $this->migration()->up();
        $this->migration()->up();

        $this->assertSame(1, BookingChange::count());
    }

    public function test_backfill_records_upcoming_bookings_as_new(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        $paul = Member::factory()->named('Paul', 'Player', 'paul')->create();
        $guest = Registration::factory()->create(['event_id' => $event->id]);
        $own = Registration::factory()->create([
            'event_id' => $event->id,
            'member_id' => $paul->id,
            'first_name' => 'Paul',
            'last_name' => 'Player',
            'email' => null,
            'phone' => null,
        ]);
        $this->forgetJournal();

        $this->migration()->up();

        $rows = BookingChange::orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertSame([BookingChangeKind::Created, BookingChangeKind::Created], $rows->pluck('change')->all());
        $this->assertNull($rows->firstWhere('registration_id', $guest->id)->actor_member_id);
        $this->assertSame($paul->id, $rows->firstWhere('registration_id', $own->id)->actor_member_id);
        $this->assertSame('Paul Player', $rows->firstWhere('registration_id', $own->id)->actor_label);
    }

    public function test_backfill_skips_past_events(): void
    {
        $event = Event::factory()->past()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $event->id]);
        $this->forgetJournal();

        $this->migration()->up();

        $this->assertSame(0, BookingChange::count());
    }

    public function test_backfill_does_not_duplicate(): void
    {
        Registration::factory()->count(2)->create();
        $this->forgetJournal();

        $this->migration()->up();
        $this->migration()->up();

        $this->assertSame(2, BookingChange::count());
        $this->assertSame(2, BookingChange::distinct()->count('registration_id'));
    }

    /** What a database looked like before the journal: bookings, no rows. */
    private function forgetJournal(): void
    {
        BookingChange::query()->delete();
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_10_26_000001_create_booking_journal.php');
    }
}
