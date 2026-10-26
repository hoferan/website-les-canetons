<?php

namespace Tests\Feature;

use App\Models\BookingChange;
use App\Models\Event;
use App\Models\InboxRead;
use App\Models\Member;
use App\Models\Registration;
use App\Support\Inbox\InboxRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Reading and marking an event's guest list read, for the whole committee
 * (#123, ADR 0035).
 */
class BookingReadEndpointTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();

        $this->event = Event::factory()->takingRegistrations()->create();
    }

    public function test_anonymous_gets_401(): void
    {
        $this->getJson($this->url())->assertStatus(401);
        $this->putJson($this->url(), ['upTo' => 1])->assertStatus(401);
        $this->deleteJson($this->url())->assertStatus(401);
    }

    public function test_a_player_gets_403(): void
    {
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->actingAsMember($perrine)->getJson($this->url())->assertForbidden();
        $this->actingAsMember($perrine)->putJson($this->url(), ['upTo' => 1])->assertForbidden();
        $this->actingAsMember($perrine)->deleteJson($this->url())->assertForbidden();
    }

    public function test_show_reports_the_state(): void
    {
        $first = Registration::factory()->create(['event_id' => $this->event->id]);
        $second = Registration::factory()->create(['event_id' => $this->event->id]);

        $this->actingAsMember($this->camille())
            ->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('readAt', null)
            ->assertJsonPath('readBy', null)
            ->assertJsonPath('changes.new', 2)
            ->assertJsonPath('changes.changed', 0)
            ->assertJsonPath('changes.cancelled', 0)
            ->assertJsonPath('newIds', [$first->id, $second->id])
            ->assertJsonPath('changedIds', [])
            ->assertJsonPath('latestChangeId', $this->latest());
    }

    public function test_mark_clears_the_item_for_everyone(): void
    {
        Registration::factory()->create(['event_id' => $this->event->id]);

        $this->actingAsMember($this->camille())
            ->putJson($this->url(), ['upTo' => $this->latest()])
            ->assertOk()
            ->assertJsonPath('readBy', 'Camille Committee')
            ->assertJsonPath('changes.new', 0);

        $paul = Member::factory()->named('Paul', 'Direction', 'paul')->administrator()->create();
        $this->assertCount(0, app(InboxRegistry::class)->openFor($paul)->where('kind', 'eventBookings'));
    }

    public function test_a_change_after_the_screen_loaded_stays_unread(): void
    {
        Registration::factory()->create(['event_id' => $this->event->id]);
        $camille = $this->camille();
        $shown = $this->actingAsMember($camille)->getJson($this->url())->json('latestChangeId');

        $late = Registration::factory()->create(['event_id' => $this->event->id]);

        $this->actingAsMember($camille)
            ->putJson($this->url(), ['upTo' => $shown])
            ->assertOk()
            ->assertJsonPath('changes.new', 1)
            ->assertJsonPath('newIds', [$late->id]);
    }

    public function test_up_to_from_another_event_is_refused(): void
    {
        Registration::factory()->create();
        $foreign = $this->latest(BookingChange::max('event_id'));

        $this->actingAsMember($this->camille())
            ->putJson($this->url(), ['upTo' => $foreign])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'upTo');

        $this->assertSame(0, InboxRead::count());
    }

    public function test_up_to_is_required(): void
    {
        $this->actingAsMember($this->camille())
            ->putJson($this->url(), [])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'upTo')
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_marking_twice_writes_one_mark(): void
    {
        Registration::factory()->create(['event_id' => $this->event->id]);
        $camille = $this->camille();

        $this->actingAsMember($camille)->putJson($this->url(), ['upTo' => $this->latest()])->assertOk();
        $this->actingAsMember($camille)->putJson($this->url(), ['upTo' => $this->latest()])->assertOk();

        $this->assertSame(1, InboxRead::count());
    }

    public function test_unmark_restores_the_counts_before_it(): void
    {
        $luc = Registration::factory()->create(['event_id' => $this->event->id]);
        $camille = $this->camille();
        $this->actingAsMember($camille)->putJson($this->url(), ['upTo' => $this->latest()])->assertOk();
        Registration::factory()->create(['event_id' => $this->event->id]);
        $this->actingAsMember($camille)->putJson($this->url(), ['upTo' => $this->latest()])->assertOk();

        $this->actingAsMember($camille)
            ->deleteJson($this->url())
            ->assertOk()
            ->assertJsonPath('changes.new', 1)
            ->assertJsonPath('readBy', 'Camille Committee');

        $this->assertSame(1, InboxRead::count());
        $this->assertNotContains($luc->id, $this->actingAsMember($camille)->getJson($this->url())->json('newIds'));
    }

    public function test_unmark_without_a_mark_is_harmless(): void
    {
        Registration::factory()->create(['event_id' => $this->event->id]);

        $this->actingAsMember($this->camille())
            ->deleteJson($this->url())
            ->assertOk()
            ->assertJsonPath('readAt', null)
            ->assertJsonPath('changes.new', 1);
    }

    public function test_a_draft_event_is_not_found(): void
    {
        $draft = Event::factory()->draft()->takingRegistrations()->create();

        $this->actingAsMember($this->camille())
            ->getJson("/api/v1/events/{$draft->id}/booking-read")
            ->assertNotFound();
    }

    private function url(): string
    {
        return "/api/v1/events/{$this->event->id}/booking-read";
    }

    private function latest(?int $eventId = null): int
    {
        return (int) BookingChange::where('event_id', $eventId ?? $this->event->id)->max('id');
    }

    private function camille(): Member
    {
        return Member::where('username', 'camille')->first()
            ?? Member::factory()->named('Camille', 'Committee', 'camille')->committee()->create();
    }
}
