<?php

namespace Tests\Feature;

use App\Models\BookingChange;
use App\Models\ContactMessage;
use App\Models\Event;
use App\Models\InboxRead;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationOption;
use App\Models\Role;
use App\Support\BandTime;
use App\Support\Inbox\InboxItem;
use App\Support\Inbox\InboxRegistry;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

class InboxRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_open_message_is_an_inbox_item(): void
    {
        $message = ContactMessage::factory()->create(['first_name' => 'Jean', 'last_name' => 'Dupont']);

        $items = app(InboxRegistry::class)->openFor($this->committeeMember());

        $this->assertCount(1, $items);
        $this->assertSame('contactMessage', $items->first()->kind);
        $this->assertStringContainsString('Jean Dupont', $items->first()->title);
        $this->assertSame("/contact-messages?open={$message->id}", $items->first()->path);
    }

    public function test_a_handled_message_leaves_the_inbox(): void
    {
        $camille = $this->committeeMember();
        ContactMessage::factory()->handled($camille)->create();

        $this->assertCount(0, app(InboxRegistry::class)->openFor($camille));
    }

    public function test_a_member_without_the_permission_sees_nothing(): void
    {
        // Filtered, never refused: the nav entry is already hidden from them,
        // and the endpoint must stay safe to call unconditionally.
        ContactMessage::factory()->count(2)->create();
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->assertCount(0, app(InboxRegistry::class)->openFor($perrine));
        $this->assertSame([], app(InboxRegistry::class)->countsFor($perrine));
    }

    public function test_counts_are_keyed_by_kind(): void
    {
        ContactMessage::factory()->count(3)->create();

        $this->assertSame(
            ['contactMessage' => 3, 'eventBookings' => 0],
            app(InboxRegistry::class)->countsFor($this->committeeMember()),
        );
    }

    public function test_a_booked_event_is_an_inbox_item(): void
    {
        $event = Event::factory()->takingRegistrations()->create(['title' => 'Souper de soutien']);
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        Registration::factory()->withChoice($meal, 3)->create(['event_id' => $event->id]);

        $item = $this->bookingItems()->sole();

        $this->assertSame($event->id, $item->id);
        $this->assertSame('Souper de soutien', $item->title);
        $this->assertSame("/events/{$event->id}/registrations", $item->path);
        $this->assertSame(['new' => 1, 'changed' => 0, 'cancelled' => 0], $item->facts?->changes);
        $this->assertSame(1, $item->facts->bookings);
        $this->assertSame(3, $item->facts->guests);
        $this->assertFalse($item->facts->closed);
        $this->assertSame((int) BookingChange::max('id'), $item->facts->latestChangeId);
    }

    public function test_a_read_event_leaves_the_inbox(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $event->id]);

        $this->markRead($event);

        $this->assertCount(0, $this->bookingItems());
    }

    public function test_a_change_after_the_read_brings_it_back(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $event->id]);
        $this->markRead($event);

        Registration::factory()->create(['event_id' => $event->id]);

        $facts = $this->bookingItems()->sole()->facts;
        $this->assertSame(['new' => 1, 'changed' => 0, 'cancelled' => 0], $facts?->changes);
        $this->assertSame(2, $facts->bookings);
    }

    public function test_an_event_today_still_shows(): void
    {
        // Earlier today in Fribourg, already over by the clock, still today.
        $morning = CarbonImmutable::now(BandTime::ZONE)->startOfDay()->addMinutes(30);
        $today = Event::factory()->takingRegistrations()->create([
            'starts_at' => $morning->utc(),
            'ends_at' => $morning->addMinutes(10)->utc(),
        ]);
        // Started yesterday, ends tomorrow.
        $weekend = Event::factory()->takingRegistrations()->create([
            'starts_at' => $morning->subDay()->utc(),
            'ends_at' => $morning->addDay()->utc(),
        ]);
        Registration::factory()->create(['event_id' => $today->id]);
        Registration::factory()->create(['event_id' => $weekend->id]);

        $this->assertEqualsCanonicalizing([$today->id, $weekend->id], $this->bookingItems()->pluck('id')->all());
    }

    public function test_an_event_that_ended_yesterday_is_gone(): void
    {
        $yesterday = CarbonImmutable::now(BandTime::ZONE)->subDay()->setTime(20, 0);
        $event = Event::factory()->takingRegistrations()->create([
            'starts_at' => $yesterday->utc(),
            'ends_at' => $yesterday->addHours(3)->utc(),
        ]);
        Registration::factory()->create(['event_id' => $event->id]);

        $this->assertCount(0, $this->bookingItems());
    }

    public function test_an_unpublished_or_formless_event_is_gone(): void
    {
        $draft = Event::factory()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $draft->id]);
        $draft->update(['published_at' => null]);
        $formless = Event::factory()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $formless->id]);
        $formless->update(['registration_closes_at' => null]);

        $this->assertCount(0, $this->bookingItems());
    }

    public function test_counts_one_per_event(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        Registration::factory()->count(2)->create(['event_id' => $event->id]);

        $this->assertSame(
            ['contactMessage' => 0, 'eventBookings' => 1],
            app(InboxRegistry::class)->countsFor($this->committeeMember()),
        );
        $this->assertSame(
            ['contactMessage' => 0, 'eventBookings' => 1],
            app(InboxRegistry::class)->countsFor(Member::factory()->administrator()->create()),
        );
    }

    public function test_nearly_full_lists_options_with_five_or_fewer_left(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        $meat = RegistrationOption::factory()->labelled('Viande')->create(['event_id' => $event->id, 'capacity' => 10]);
        $fish = RegistrationOption::factory()->labelled('Poisson')->create(['event_id' => $event->id, 'capacity' => 10]);
        $kids = RegistrationOption::factory()->labelled('Enfant')->create(['event_id' => $event->id, 'capacity' => 2]);
        RegistrationOption::factory()->labelled('Végé')->create(['event_id' => $event->id]);
        Registration::factory()->withChoice($meat, 6)->create(['event_id' => $event->id]);
        Registration::factory()->withChoice($fish, 4)->create(['event_id' => $event->id]);
        Registration::factory()->withChoice($kids, 2)->create(['event_id' => $event->id]);

        $this->assertSame(
            [['label' => 'Viande', 'remaining' => 4], ['label' => 'Enfant', 'remaining' => 0]],
            $this->bookingItems()->sole()->facts?->nearlyFull,
        );
    }

    public function test_a_player_sees_no_bookings(): void
    {
        Registration::factory()->create();
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->assertCount(0, app(InboxRegistry::class)->openFor($perrine));
    }

    /** @return Collection<int, InboxItem> */
    private function bookingItems(): Collection
    {
        return app(InboxRegistry::class)
            ->openFor($this->committeeMember())
            ->where('kind', 'eventBookings')
            ->values();
    }

    private function markRead(Event $event): void
    {
        InboxRead::create([
            'kind' => InboxRead::EVENT_BOOKINGS,
            'subject_id' => $event->id,
            'read_up_to' => (int) BookingChange::where('event_id', $event->id)->max('id'),
        ]);
    }

    private function committeeMember(): Member
    {
        $existing = Member::where('username', 'camille')->first();
        if ($existing !== null) {
            return $existing;
        }

        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }
}
