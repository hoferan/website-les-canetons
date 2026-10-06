<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventTag;
use App\Models\Member;
use App\Support\EntityTag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Putting tags on events, reading them back, and filtering the planning by
 * one (#107).
 */
class EventTagAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
    }

    private function tag(string $labelFr): EventTag
    {
        return EventTag::query()->where('label_fr', $labelFr)->firstOrFail();
    }

    public function test_a_new_event_carries_the_tags_it_was_given(): void
    {
        $concert = $this->tag('Concert');
        $carnaval = $this->tag('Carnaval');

        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', ['title' => 'Cortège', 'tagIds' => [$carnaval->id, $concert->id]])
            ->assertStatus(201)
            // In the tag order, not the order they were sent in.
            ->assertJsonPath('tags.0.labelFr', 'Concert')
            ->assertJsonPath('tags.0.colour', 'teal')
            ->assertJsonPath('tags.1.labelFr', 'Carnaval')
            ->assertJsonPath('tags.1.labelDe', 'Fasnacht')
            ->assertJsonMissingPath('tags.0.eventCount');
    }

    public function test_an_event_without_tags_has_an_empty_list(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', ['title' => 'Cortège'])
            ->assertStatus(201)
            ->assertJsonPath('tags', []);
    }

    public function test_the_same_tag_twice_is_stored_once(): void
    {
        $concert = $this->tag('Concert');

        $id = $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', ['title' => 'Cortège', 'tagIds' => [$concert->id, $concert->id]])
            ->assertStatus(201)
            ->assertJsonCount(1, 'tags')
            ->json('id');

        $this->assertSame(1, Event::findOrFail($id)->tags()->count());
    }

    public function test_an_unknown_tag_is_refused_on_its_own_index(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', ['title' => 'Cortège', 'tagIds' => [$this->tag('Concert')->id, 999999]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'tagIds.1');
        $this->assertSame(0, Event::count());
    }

    public function test_a_series_tags_every_event_it_writes(): void
    {
        $rehearsal = $this->tag('Répétition');

        $this->actingAsMember($this->organiser)->postJson('/api/v1/events/series', [
            'template' => [
                'title' => 'Répétition', 'location' => 'Werkhof', 'attire' => null, 'isPublic' => false,
                'notes' => null, 'startTime' => '19:30', 'endTime' => '22:00', 'tagIds' => [$rehearsal->id],
            ],
            'dates' => ['2026-11-05', '2026-11-12'],
        ])->assertStatus(201);

        $this->assertSame(2, $rehearsal->events()->count());
    }

    public function test_an_update_with_tags_replaces_them_and_one_without_leaves_them(): void
    {
        $event = Event::factory()->create();
        $event->tags()->attach($this->tag('Concert'));

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['tagIds' => [$this->tag('Sortie')->id]])
            ->assertOk()
            ->assertJsonCount(1, 'tags')
            ->assertJsonPath('tags.0.labelFr', 'Sortie');

        $event->refresh();
        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Renommé'])
            ->assertOk()
            ->assertJsonPath('tags.0.labelFr', 'Sortie');

        $event->refresh();
        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['tagIds' => []])
            ->assertOk()
            ->assertJsonPath('tags', []);
    }

    public function test_the_events_etag_moves_when_its_tags_change(): void
    {
        $event = Event::factory()->create();
        $before = EntityTag::compute('event', $event);

        $event->tags()->attach($this->tag('Concert'));

        $this->assertNotSame($before, EntityTag::compute('event', $event->fresh()));
    }

    public function test_the_planning_filters_by_one_tag(): void
    {
        $concert = $this->tag('Concert');
        Event::factory()->create(['title' => 'Concert annuel'])->tags()->attach($concert);
        Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events?tag={$concert->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Concert annuel')
            ->assertJsonPath('data.0.tags.0.labelFr', 'Concert');
    }

    public function test_an_unknown_tag_filter_is_refused(): void
    {
        $this->actingAsMember($this->organiser)
            ->getJson('/api/v1/events?tag=999999')
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'tag');
    }

    public function test_the_public_agenda_shows_an_events_tags(): void
    {
        Event::factory()->create([
            'is_public' => true, 'starts_at' => now()->addWeek(), 'ends_at' => now()->addWeek()->addHours(2),
        ])->tags()->attach($this->tag('Carnaval'));

        $this->getJson('/api/v1/agenda')
            ->assertOk()
            ->assertJsonPath('data.0.tags.0.labelFr', 'Carnaval')
            ->assertJsonPath('data.0.tags.0.colour', 'pink');
    }

    public function test_tags_do_not_cost_a_query_per_event(): void
    {
        foreach (Event::factory()->count(20)->create() as $event) {
            $event->tags()->attach(EventTag::query()->pluck('id'));
        }

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($this->organiser)->getJson('/api/v1/events')->assertOk();

        // The planning's own budget (EventCountsTest) plus the one tag load.
        $this->assertLessThanOrEqual(5, $queries);
    }
}
