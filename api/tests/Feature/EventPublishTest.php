<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class EventPublishTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
    }

    private function publish(Event $event): TestResponse
    {
        return $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->postJson("/api/v1/events/{$event->id}/publish");
    }

    private function unpublish(Event $event): TestResponse
    {
        return $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->deleteJson("/api/v1/events/{$event->id}/publish");
    }

    public function test_publishing_a_complete_draft_publishes_it(): void
    {
        $draft = Event::factory()->draft()->create();

        $this->publish($draft)
            ->assertOk()
            ->assertJsonPath('id', $draft->id);

        $this->assertNotNull($draft->fresh()->published_at);
        $this->assertFalse($draft->fresh()->isDraft());
    }

    public function test_publishing_an_incomplete_draft_names_the_missing_fields(): void
    {
        $draft = Event::factory()->draft()->create(['location' => null]);

        $this->publish($draft)
            ->assertStatus(422)
            ->assertJsonPath('code', 'event_incomplete')
            ->assertJsonCount(1, 'errors')
            ->assertJsonPath('errors.0.field', 'location')
            ->assertJsonPath('errors.0.reason', 'required');

        $this->assertTrue($draft->fresh()->isDraft());
    }

    public function test_publishing_a_draft_with_nothing_names_all_three(): void
    {
        $draft = Event::factory()->draft()->create(['starts_at' => null, 'ends_at' => null, 'location' => null]);

        $response = $this->publish($draft)->assertStatus(422);

        $this->assertEqualsCanonicalizing(
            ['startsAt', 'endsAt', 'location'],
            array_column($response->json('errors'), 'field'),
        );
    }

    public function test_publishing_refuses_an_end_that_is_not_after_the_start(): void
    {
        // A draft is built one field at a time, so PATCH can leave it with an
        // end before its start. Publishing is where a well-formed event is
        // held now, and an event of negative length must not reach the band.
        $draft = Event::factory()->draft()->create([
            'starts_at' => '2026-10-03 14:00:00',
            'ends_at' => '2026-10-03 12:00:00',
        ]);

        $this->publish($draft)
            ->assertStatus(422)
            ->assertJsonPath('code', 'event_incomplete')
            ->assertJsonPath('errors.0.field', 'endsAt')
            ->assertJsonPath('errors.0.reason', 'must_be_after');

        $this->assertTrue($draft->fresh()->isDraft());
    }

    public function test_publishing_twice_is_not_an_error(): void
    {
        $event = Event::factory()->create();
        // Read back, because the column drops the factory's microseconds.
        $publishedAt = $event->fresh()->published_at;

        $this->publish($event)->assertOk();

        // The first publication stands; a second click does not move it.
        $this->assertEquals($publishedAt, $event->fresh()->published_at);
    }

    public function test_a_published_event_always_has_both_dates(): void
    {
        // Decision C6: no `weekend` flag can come back while every published
        // row carries a start and an end. The columns no longer say so, so
        // this is the pin. Try every way a dateless event could slip through.
        $complete = Event::factory()->draft()->create();
        $noEnd = Event::factory()->draft()->create(['ends_at' => null]);
        $noStart = Event::factory()->draft()->create(['starts_at' => null]);

        $this->publish($complete)->assertOk();
        $this->publish($noEnd)->assertStatus(422);
        $this->publish($noStart)->assertStatus(422);

        $this->assertSame(
            0,
            Event::query()->published()->where(fn ($q) => $q->whereNull('starts_at')->orWhereNull('ends_at'))->count(),
        );
    }

    public function test_unpublishing_puts_it_back_to_draft(): void
    {
        $event = Event::factory()->create();

        $this->unpublish($event)
            ->assertOk()
            ->assertJsonPath('publishedAt', null);

        $this->assertTrue($event->fresh()->isDraft());
    }

    public function test_unpublishing_is_refused_after_an_answer(): void
    {
        $event = Event::factory()->create();
        Attendance::factory()->create(['event_id' => $event->id]);

        $this->unpublish($event)
            ->assertStatus(409)
            ->assertJsonPath('code', 'event_has_answers');

        $this->assertFalse($event->fresh()->isDraft());
    }

    public function test_unpublishing_is_refused_after_a_registration(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $event->id]);

        $this->unpublish($event)
            ->assertStatus(409)
            ->assertJsonPath('code', 'event_has_answers');
    }

    public function test_unpublishing_a_draft_is_not_an_error(): void
    {
        $this->unpublish(Event::factory()->draft()->create())->assertOk();
    }

    public function test_a_player_cannot_publish_or_unpublish(): void
    {
        $player = Member::factory()->inSection('Cloches')->create();
        // A PUBLISHED event: the player can see it, so lacking the permission is
        // a 403. Against a draft the same request is a 404, because the player
        // may not know it exists (EventDraftVisibilityTest pins that answer).
        $event = Event::factory()->create();

        $this->actingAsMember($player)
            ->withHeaders($this->ifMatch('event', $event))
            ->postJson("/api/v1/events/{$event->id}/publish")
            ->assertStatus(403);
        $this->actingAsMember($player)
            ->withHeaders($this->ifMatch('event', $event))
            ->deleteJson("/api/v1/events/{$event->id}/publish")
            ->assertStatus(403);

        $this->assertFalse($event->fresh()->isDraft());
    }

    public function test_publishing_needs_the_current_etag(): void
    {
        $draft = Event::factory()->draft()->create();

        $this->actingAsMember($this->organiser)
            ->postJson("/api/v1/events/{$draft->id}/publish")
            ->assertStatus(428);

        $this->actingAsMember($this->organiser)
            ->withHeaders(['If-Match' => '"stale"'])
            ->postJson("/api/v1/events/{$draft->id}/publish")
            ->assertStatus(412);
    }

    public function test_publishing_and_unpublishing_are_audited(): void
    {
        $event = Event::factory()->draft()->create(['title' => 'Concert de Noël']);

        $this->publish($event)->assertOk();
        $this->assertDatabaseHas('audit_log', [
            'actor_member_id' => $this->organiser->id,
            'action' => 'event.published',
            'target_type' => 'event',
            'target_id' => $event->id,
            'target_label' => 'Concert de Noël',
        ]);

        $this->unpublish($event->fresh())->assertOk();
        $this->assertDatabaseHas('audit_log', [
            'action' => 'event.unpublished',
            'target_id' => $event->id,
        ]);
    }
}
