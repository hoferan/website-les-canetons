<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Support\BandTime;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EventIndexTest extends TestCase
{
    use RefreshDatabase;

    private Member $member;

    protected function setUp(): void
    {
        parent::setUp();
        // An ordinary player. Reading the planning needs no permission:
        // everybody in the band needs to know when the next rehearsal is.
        $this->member = Member::factory()->inSection('Cloches')->create();
    }

    public function test_an_anonymous_caller_is_refused(): void
    {
        // 401, not 403: an anonymous caller has not failed a permission
        // check, they have not authenticated at all.
        $this->getJson('/api/v1/events')->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
    }

    public function test_it_lists_upcoming_events_soonest_first(): void
    {
        Event::factory()->create(['title' => 'Plus tard', 'starts_at' => now()->addDays(20)]);
        Event::factory()->create(['title' => 'Bientôt', 'starts_at' => now()->addDays(2)]);

        $response = $this->actingAsMember($this->member)->getJson('/api/v1/events')->assertOk();

        $this->assertSame(['Bientôt', 'Plus tard'], array_column($response->json('data'), 'title'));
    }

    public function test_past_events_are_absent_by_default(): void
    {
        // "The planning" means what is ahead. The full list would be a hundred
        // rehearsals to scroll past on a phone.
        Event::factory()->past()->create(['title' => 'Déjà joué']);
        Event::factory()->create(['title' => 'À venir']);

        $response = $this->actingAsMember($this->member)->getJson('/api/v1/events')->assertOk();

        $this->assertSame(['À venir'], array_column($response->json('data'), 'title'));
    }

    public function test_past_returns_only_the_history_newest_first(): void
    {
        // ?past=1 is the other half of the list, not a superset of it, and it
        // reverses the order because history is read backwards from now.
        Event::factory()->past()->create(['title' => 'Il y a longtemps', 'starts_at' => now()->subDays(30)]);
        Event::factory()->past()->create(['title' => 'La semaine dernière', 'starts_at' => now()->subDays(7)]);
        Event::factory()->create(['title' => 'À venir']);

        $response = $this->actingAsMember($this->member)->getJson('/api/v1/events?past=1')->assertOk();

        $this->assertSame(
            ['La semaine dernière', 'Il y a longtemps'],
            array_column($response->json('data'), 'title'),
        );
    }

    public function test_an_event_happening_today_stays_in_the_planning_all_day(): void
    {
        // Frozen to mid-morning in Fribourg: between 00:00 and 01:00 local,
        // now()->subHour() belongs to yesterday and the test would fail once
        // a day. Today rather than a fixed date, because travelling to a
        // literal date invalidates the session and every request answers 401.
        $this->travelTo(CarbonImmutable::now(BandTime::ZONE)->setTime(10, 0));
        // "Past" is measured from the start of today in Fribourg, not from
        // now(). A rehearsal that began an hour ago must not vanish from the
        // planning of somebody running late.
        Event::factory()->create([
            'starts_at' => now()->subHours(1),
            'ends_at' => now()->addHour(),
            'title' => 'En cours',
        ]);

        $response = $this->actingAsMember($this->member)->getJson('/api/v1/events')->assertOk();

        $this->assertSame(['En cours'], array_column($response->json('data'), 'title'));
    }

    public function test_the_resource_carries_what_the_card_renders(): void
    {
        $event = Event::factory()->create([
            'title' => 'Répétition',
            'location' => 'Werkhof',
            'attire' => 'Libre',
            'notes' => null,
            'is_public' => false,
        ]);

        $response = $this->actingAsMember($this->member)->getJson('/api/v1/events')
            ->assertOk()
            ->assertJsonStructure(['data' => [['id', 'title', 'startsAt', 'endsAt', 'location', 'attire', 'isPublic', 'notes']]]);

        $row = $response->json('data')[0];

        // assertJsonStructure pins the key set only; it would pass with
        // location and attire swapped. These pin the values.
        $this->assertSame($event->id, $row['id']);
        $this->assertSame('Répétition', $row['title']);
        $this->assertSame($event->starts_at->toIso8601String(), $row['startsAt']);
        $this->assertSame($event->ends_at->toIso8601String(), $row['endsAt']);
        $this->assertSame('Werkhof', $row['location']);
        $this->assertSame('Libre', $row['attire']);
        $this->assertFalse($row['isPublic']);
        $this->assertNull($row['notes']);
    }

    public function test_the_response_is_never_cached(): void
    {
        // This list varies by identity, since it carries the caller's own
        // answers, and a shared proxy that cached one member's view would
        // serve it to another.
        $this->actingAsMember($this->member)->getJson('/api/v1/events')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_it_shows_one_event(): void
    {
        // The edit form loads through this rather than the list, which does
        // not contain past events by default.
        $event = Event::factory()->create(['title' => 'Vendanges Cheyres']);

        $this->actingAsMember($this->member)->getJson("/api/v1/events/{$event->id}")
            ->assertOk()
            ->assertJsonPath('title', 'Vendanges Cheyres');
    }

    public function test_showing_a_past_event_works_too(): void
    {
        $event = Event::factory()->past()->create();

        $this->actingAsMember($this->member)->getJson("/api/v1/events/{$event->id}")->assertOk();
    }

    public function test_an_unknown_event_is_a_404(): void
    {
        // assertStatus(404) alone cannot tell "route-model binding refused an
        // unknown id" from "there is no such route": both answer the same
        // problem document (ADR 0012), on purpose, since telling them apart is
        // the enumeration a 404 prevents. So the route is proved to exist by
        // driving it with an id that resolves. Delete the route and the first
        // half fails; break the binding and the second does.
        $event = Event::factory()->create(['starts_at' => now()->addDays(3)]);

        $this->actingAsMember($this->member)
            ->getJson("/api/v1/events/{$event->id}")
            ->assertOk();

        $this->actingAsMember($this->member)
            ->getJson('/api/v1/events/99999')
            ->assertStatus(404)
            ->assertJsonPath('code', 'not_found');
    }

    public function test_listing_the_planning_costs_a_fixed_number_of_queries(): void
    {
        // A season is about 40 events, and this is the screen the whole band
        // opens on a shared host.
        Event::factory()->count(20)->create();

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($this->member)->getJson('/api/v1/events')->assertOk();

        // The event tags (#107) and the posters (#228) are each one eager load
        // for the whole list.
        $this->assertLessThanOrEqual(5, $queries, 'GET /api/v1/events should not scale queries with events');
    }
}
