<?php

namespace Tests\Feature;

use App\Models\BookingChange;
use App\Models\Event;
use App\Models\InboxRead;
use App\Models\Member;
use App\Models\Registration;
use App\Support\BookingChangeKind;
use App\Support\Inbox\BookingDelta;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The committee's counts are net per booking: each booking now against how it
 * stood at the read mark, never a tally of journal rows (#123, ADR 0035).
 */
class BookingDeltaTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();

        $this->event = Event::factory()->takingRegistrations()->create();
    }

    public function test_amended_since_read_is_new(): void
    {
        $this->read();
        $anne = $this->booking();
        $this->change($anne->id, BookingChangeKind::Created);
        $this->change($anne->id, BookingChangeKind::Changed);
        $this->change($anne->id, BookingChangeKind::Changed);

        $delta = BookingDelta::for($this->event);

        $this->assertSame([$anne->id], $delta->newIds);
        $this->assertSame([], $delta->changedIds);
        $this->assertSame(0, $delta->cancelled);
        $this->assertTrue($delta->isOpen());
    }

    public function test_booked_and_cancelled_since_read_is_nothing(): void
    {
        $this->read();
        $this->change(9999, BookingChangeKind::Created);
        $this->change(9999, BookingChangeKind::Cancelled);

        $delta = BookingDelta::for($this->event);

        $this->assertSame([], $delta->newIds);
        $this->assertSame(0, $delta->cancelled);
        $this->assertFalse($delta->isOpen());
    }

    public function test_corrected_then_cancelled_is_cancelled(): void
    {
        $this->change(9999, BookingChangeKind::Created);
        $this->read();
        $this->change(9999, BookingChangeKind::Changed);
        $this->change(9999, BookingChangeKind::Cancelled);

        $delta = BookingDelta::for($this->event);

        $this->assertSame(1, $delta->cancelled);
        $this->assertSame([], $delta->changedIds);
    }

    public function test_changed_before_the_mark_is_not_counted(): void
    {
        $luc = $this->booking();
        $this->change($luc->id, BookingChangeKind::Created);
        $this->change($luc->id, BookingChangeKind::Changed);
        $this->read();

        $this->assertFalse(BookingDelta::for($this->event)->isOpen());

        $this->change($luc->id, BookingChangeKind::Changed);

        $this->assertSame([$luc->id], BookingDelta::for($this->event)->changedIds);
    }

    public function test_latest_change_id_covers_rows_that_net_to_nothing(): void
    {
        $this->change(9999, BookingChangeKind::Created);
        $last = $this->change(9999, BookingChangeKind::Cancelled);

        $this->assertSame($last->id, BookingDelta::for($this->event)->latestChangeId);
    }

    public function test_without_a_mark_everything_counts(): void
    {
        $first = $this->booking();
        $second = $this->booking();
        $this->change($first->id, BookingChangeKind::Created);
        $this->change($second->id, BookingChangeKind::Created);

        $delta = BookingDelta::for($this->event);

        $this->assertNull($delta->mark);
        $this->assertEqualsCanonicalizing([$first->id, $second->id], $delta->newIds);
    }

    public function test_another_events_changes_do_not_count(): void
    {
        $other = Event::factory()->takingRegistrations()->create();
        BookingChange::create([
            'event_id' => $other->id,
            'registration_id' => 9998,
            'kind' => BookingChangeKind::Created,
        ]);

        $delta = BookingDelta::for($this->event);

        $this->assertFalse($delta->isOpen());
        $this->assertSame(0, $delta->latestChangeId);
    }

    public function test_actors_name_who_moved_a_netted_booking(): void
    {
        $paul = Member::factory()->named('Paul', 'Direction', 'paul')->create();
        $luc = $this->booking();
        $this->change($luc->id, BookingChangeKind::Created);
        $this->read();
        // A guest's booking adds nobody; a booking that nets to nothing adds
        // nobody either.
        $guest = $this->booking();
        $this->change($guest->id, BookingChangeKind::Created);
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $this->change(9999, BookingChangeKind::Created, $camille);
        $this->change(9999, BookingChangeKind::Cancelled, $camille);
        $last = $this->change($luc->id, BookingChangeKind::Changed, $paul);

        $delta = BookingDelta::for($this->event);

        $this->assertSame(['Paul Direction'], $delta->actors);
        $this->assertEquals($last->created_at, $delta->lastChangeAt);
    }

    public function test_actor_label_survives_account_deletion(): void
    {
        $paul = Member::factory()->named('Paul', 'Direction', 'paul')->create();
        $luc = $this->booking();
        $this->change($luc->id, BookingChangeKind::Created);
        $this->read();
        $this->change($luc->id, BookingChangeKind::Changed, $paul);

        $paul->delete();

        $this->assertSame(['Paul Direction'], BookingDelta::for($this->event)->actors);
    }

    public function test_the_newest_mark_is_the_one_in_force(): void
    {
        $luc = $this->booking();
        $this->change($luc->id, BookingChangeKind::Created);
        $first = $this->read();
        $this->change($luc->id, BookingChangeKind::Changed);
        $second = $this->read();

        $delta = BookingDelta::for($this->event);

        $this->assertSame($second->id, $delta->mark?->id);
        $this->assertFalse($delta->isOpen());

        $second->delete();

        $this->assertSame($first->id, BookingDelta::for($this->event)->mark?->id);
        $this->assertSame([$luc->id], BookingDelta::for($this->event)->changedIds);
    }

    /** A booking that exists, with whatever the factory journaled cleared. */
    private function booking(): Registration
    {
        $booking = Registration::factory()->create(['event_id' => $this->event->id]);
        BookingChange::where('registration_id', $booking->id)->delete();

        return $booking;
    }

    private function change(int $registrationId, BookingChangeKind $kind, ?Member $actor = null): BookingChange
    {
        return BookingChange::create([
            'event_id' => $this->event->id,
            'registration_id' => $registrationId,
            'kind' => $kind,
            'actor_member_id' => $actor?->id,
            'actor_label' => $actor?->fullName(),
        ]);
    }

    /** Marks everything journaled so far as read. */
    private function read(): InboxRead
    {
        return InboxRead::create([
            'kind' => InboxRead::EVENT_BOOKINGS,
            'subject_id' => $this->event->id,
            'read_up_to' => (int) BookingChange::where('event_id', $this->event->id)->max('id'),
        ]);
    }
}
