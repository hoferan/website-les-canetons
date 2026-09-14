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
        // An ordinary player. Reading the planning needs no permission —
        // everybody in the band needs to know when the next rehearsal is.
        $this->member = Member::factory()->inSection('Cloches')->create();
    }

    public function test_an_anonymous_caller_is_refused(): void
    {
        // 401, not 403: the planning is members-only in R1c (C1), and an
        // anonymous caller has not failed a permission check — they have not
        // authenticated at all.
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
        // C4: "the planning" means what is ahead. By next carnival the full
        // list is a hundred rehearsals to scroll past on a phone.
        Event::factory()->past()->create(['title' => 'Déjà joué']);
        Event::factory()->create(['title' => 'À venir']);

        $response = $this->actingAsMember($this->member)->getJson('/api/v1/events')->assertOk();

        $this->assertSame(['À venir'], array_column($response->json('data'), 'title'));
    }

    public function test_past_returns_only_the_history_newest_first(): void
    {
        // ?past=1 is the OTHER HALF of the list, not a superset of it, and it
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
        // Time frozen to mid-morning Fribourg. Without this the test builds
        // an event at now()->subHour() and asserts it is still upcoming —
        // true except between 00:00 and 01:00 local, when the hour before
        // now genuinely belongs to yesterday and BandTime::startOfToday()
        // is right to exclude it. A once-a-day red bar for a reason that
        // has nothing to do with what this asserts.
        // Mid-morning TODAY, not a fixed calendar date: travelling to a
        // literal date invalidates the session actingAsMember() just
        // created and every request answers 401.
        $this->travelTo(CarbonImmutable::now(BandTime::ZONE)->setTime(10, 0));
        // "Past" is measured from the START OF TODAY in Fribourg, not from
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
        $this->actingAsMember($this->member)->getJson('/api/v1/events')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_it_shows_one_event(): void
    {
        // The edit form loads through this rather than hunting the list: a
        // past event is not in the default list at all, so finding it there
        // would work until somebody edited last month's rehearsal.
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
        // unknown id" from "there is no such route at all" — both answer 404,
        // and in Task 4 that bare assertion passed with the route deleted
        // outright.
        //
        // This used to tell them apart by matching Laravel's internal "No query
        // results for model [...]" message, which was only ever visible because
        // 404 ESCAPED this API's error contract and fell through to the
        // framework's default body. A2 closed that escape, so the string is
        // gone and both cases now answer the same problem document — which is
        // correct: telling a caller which of the two happened is exactly the
        // enumeration a 404 exists to prevent.
        //
        // The route is proved to exist by driving it, in the same test, with an
        // id that does resolve. Delete the route and the first half fails;
        // break the binding and the second does. That is strictly stronger than
        // the message match, and it depends on nothing internal to Laravel.
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
        // A season is ~40 events. Without this the screen that the whole band
        // opens is the one that feels a shared host.
        Event::factory()->count(20)->create();

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($this->member)->getJson('/api/v1/events')->assertOk();

        $this->assertLessThanOrEqual(3, $queries, 'GET /api/v1/events should not scale queries with events');
    }
}
