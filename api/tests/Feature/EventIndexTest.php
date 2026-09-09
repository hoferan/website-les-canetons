<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EventIndexTest extends TestCase
{
    use RefreshDatabase;

    private Member $member;

    protected function setUp(): void
    {
        parent::setUp();
        // An ordinary player. Reading the planning needs no permission —
        // everybody in the band needs to know when the next rehearsal is.
        $this->member = Member::factory()->inSection('Cloches')->create();
    }

    public function test_an_anonymous_caller_is_refused(): void
    {
        // 401, not 403: the planning is members-only in R1c (C1), and an
        // anonymous caller has not failed a permission check — they have not
        // authenticated at all.
        $this->getJson('/api/events')->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
    }

    public function test_it_lists_upcoming_events_soonest_first(): void
    {
        Event::factory()->create(['title' => 'Plus tard', 'starts_at' => now()->addDays(20)]);
        Event::factory()->create(['title' => 'Bientôt', 'starts_at' => now()->addDays(2)]);

        $response = $this->actingAsMember($this->member)->getJson('/api/events')->assertOk();

        $this->assertSame(['Bientôt', 'Plus tard'], array_column($response->json(), 'title'));
    }

    public function test_past_events_are_absent_by_default(): void
    {
        // C4: "the planning" means what is ahead. By next carnival the full
        // list is a hundred rehearsals to scroll past on a phone.
        Event::factory()->past()->create(['title' => 'Déjà joué']);
        Event::factory()->create(['title' => 'À venir']);

        $response = $this->actingAsMember($this->member)->getJson('/api/events')->assertOk();

        $this->assertSame(['À venir'], array_column($response->json(), 'title'));
    }

    public function test_past_returns_only_the_history_newest_first(): void
    {
        // ?past=1 is the OTHER HALF of the list, not a superset of it, and it
        // reverses the order because history is read backwards from now.
        Event::factory()->past()->create(['title' => 'Il y a longtemps', 'starts_at' => now()->subDays(30)]);
        Event::factory()->past()->create(['title' => 'La semaine dernière', 'starts_at' => now()->subDays(7)]);
        Event::factory()->create(['title' => 'À venir']);

        $response = $this->actingAsMember($this->member)->getJson('/api/events?past=1')->assertOk();

        $this->assertSame(
            ['La semaine dernière', 'Il y a longtemps'],
            array_column($response->json(), 'title'),
        );
    }

    public function test_an_event_happening_today_stays_in_the_planning_all_day(): void
    {
        // "Past" is measured from the START OF TODAY in Fribourg, not from
        // now(). A rehearsal that began an hour ago must not vanish from the
        // planning of somebody running late.
        Event::factory()->create([
            'starts_at' => now()->subHours(1),
            'ends_at' => now()->addHour(),
            'title' => 'En cours',
        ]);

        $response = $this->actingAsMember($this->member)->getJson('/api/events')->assertOk();

        $this->assertSame(['En cours'], array_column($response->json(), 'title'));
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

        $response = $this->actingAsMember($this->member)->getJson('/api/events')
            ->assertOk()
            ->assertJsonStructure([['id', 'title', 'startsAt', 'endsAt', 'location', 'attire', 'isPublic', 'notes']]);

        $row = $response->json()[0];

        // assertJsonStructure above pins the KEY SET; it would pass just as
        // well with location and attire swapped, or isPublic hardcoded true.
        // These pin the VALUES, which is what the test's name promises.
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
        // This list varies by identity in R1c-2, and a shared proxy that
        // cached one member's view would serve it to another.
        $this->actingAsMember($this->member)->getJson('/api/events')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_it_shows_one_event(): void
    {
        // The edit form loads through this rather than hunting the list: a
        // past event is not in the default list at all, so finding it there
        // would work until somebody edited last month's rehearsal.
        $event = Event::factory()->create(['title' => 'Vendanges Cheyres']);

        $this->actingAsMember($this->member)->getJson("/api/events/{$event->id}")
            ->assertOk()
            ->assertJsonPath('title', 'Vendanges Cheyres');
    }

    public function test_showing_a_past_event_works_too(): void
    {
        $event = Event::factory()->past()->create();

        $this->actingAsMember($this->member)->getJson("/api/events/{$event->id}")->assertOk();
    }

    public function test_an_unknown_event_is_a_404(): void
    {
        // assertStatus(404) alone cannot tell "route-model binding refused an
        // unknown id" from "there is no such route at all" — both answer 404.
        // The message is unique to route-model binding failing to resolve the
        // model, and (verified against both APP_DEBUG=true and =false) it is
        // present in the JSON body either way: Illuminate's exception handler
        // always includes an HttpException's own getMessage(), debug or not —
        // only the trace/exception/file keys are debug-gated.
        $this->actingAsMember($this->member)->getJson('/api/events/99999')
            ->assertStatus(404)
            ->assertJsonFragment(['message' => 'No query results for model [App\\Models\\Event] 99999']);
    }

    public function test_listing_the_planning_costs_a_fixed_number_of_queries(): void
    {
        // A season is ~40 events. Without this the screen that the whole band
        // opens is the one that feels a shared host.
        Event::factory()->count(20)->create();

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($this->member)->getJson('/api/events')->assertOk();

        $this->assertLessThanOrEqual(3, $queries, 'GET /api/events should not scale queries with events');
    }
}
