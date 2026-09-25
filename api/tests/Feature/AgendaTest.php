<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Support\BandTime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The public agenda: what a visitor may come and watch.
 *
 * THE FIRST AND ONLY READER OF `is_public`. The column has been settable since
 * the planning shipped and meant nothing until this endpoint, which is why
 * these tests lean on it harder than the shape: a filter that silently stopped
 * working would publish the band's whole rehearsal schedule, addresses
 * included, to anybody.
 */
class AgendaTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_is_readable_without_a_session(): void
    {
        $this->getJson('/api/v1/agenda')->assertStatus(200);
    }

    public function test_it_lists_an_upcoming_public_event(): void
    {
        Event::factory()->create([
            'title' => 'Cortège',
            'location' => 'Vieille-Ville',
            'is_public' => true,
            'starts_at' => now()->addWeek(),
            'ends_at' => now()->addWeek()->addHours(3),
        ]);

        $response = $this->getJson('/api/v1/agenda')->assertStatus(200);

        $this->assertSame('Cortège', $response->json('data.0.title'));
        $this->assertSame('Vieille-Ville', $response->json('data.0.location'));
    }

    /** The rule the whole endpoint exists to keep. */
    public function test_it_omits_an_event_the_committee_has_not_made_public(): void
    {
        Event::factory()->create([
            'title' => 'Répétition',
            'is_public' => false,
            'starts_at' => now()->addWeek(),
            'ends_at' => now()->addWeek()->addHours(2),
        ]);

        $response = $this->getJson('/api/v1/agenda')->assertStatus(200);

        $this->assertSame([], $response->json('data'));
        $response->assertDontSee('Répétition');
    }

    public function test_it_omits_an_event_that_has_already_happened(): void
    {
        Event::factory()->create([
            'title' => 'Concert de l’an dernier',
            'is_public' => true,
            'starts_at' => now()->subMonth(),
            'ends_at' => now()->subMonth()->addHours(3),
        ]);

        $this->assertSame([], $this->getJson('/api/v1/agenda')->json('data'));
    }

    /**
     * A concert that started an hour ago is still tonight's concert to
     * somebody checking the address on the way there. The split is
     * BandTime::startOfToday(), like the planning's, not now().
     *
     * Mutation-tested by hand against now(): this is the only test that fails.
     */
    public function test_an_event_happening_today_stays_on_the_agenda_all_day(): void
    {
        Event::factory()->create([
            'title' => 'Cortège',
            'is_public' => true,
            'starts_at' => BandTime::startOfToday()->addHour(),
            'ends_at' => BandTime::startOfToday()->addHours(4),
        ]);

        $this->assertSame(
            'Cortège',
            $this->getJson('/api/v1/agenda')->json('data.0.title'),
        );
    }

    public function test_it_lists_the_soonest_event_first(): void
    {
        foreach ([3, 1, 2] as $weeks) {
            Event::factory()->create([
                'title' => "Dans {$weeks}",
                'is_public' => true,
                'starts_at' => now()->addWeeks($weeks),
                'ends_at' => now()->addWeeks($weeks)->addHours(2),
            ]);
        }

        $response = $this->getJson('/api/v1/agenda')->assertStatus(200);

        $this->assertSame(
            ['Dans 1', 'Dans 2', 'Dans 3'],
            array_column($response->json('data'), 'title'),
        );
    }

    /**
     * Six fields, and not one of them internal. `notes` is the committee's
     * own note and `isPublic` is the decision itself — publishing either would
     * tell a visitor things about the band's diary that the filter above is
     * there to keep out.
     *
     * `id` and `registrationOpen` joined the four when the booking form was
     * built: the agenda is the only public list of events, so without them a
     * visitor has no way to reach the form. See PublicEventResource.
     */
    public function test_it_publishes_what_is_on_a_poster_and_nothing_else(): void
    {
        Event::factory()->create([
            'is_public' => true,
            'notes' => 'Prévoir des parapluies',
            'starts_at' => now()->addWeek(),
            'ends_at' => now()->addWeek()->addHours(2),
        ]);

        $response = $this->getJson('/api/v1/agenda')->assertStatus(200);

        $this->assertSame(
            ['id', 'title', 'startsAt', 'endsAt', 'location', 'registrationOpen'],
            array_keys($response->json('data.0')),
        );
        $response->assertDontSee('parapluies');
    }

    /**
     * The flag the public agenda decides whether to offer a booking link on.
     *
     * Both events below take bookings — `registration_closes_at` is what
     * enables that at all — and they differ only in whether the window has
     * opened. A resource that published `takesRegistrations()` instead of
     * `registrationIsOpen()` would pass every other test here and send a
     * visitor to a form that refuses them.
     */
    public function test_it_says_which_events_are_taking_bookings_right_now(): void
    {
        Event::factory()->create([
            'title' => 'Souper de soutien',
            'is_public' => true,
            'starts_at' => now()->addWeeks(4),
            'ends_at' => now()->addWeeks(4)->addHours(5),
            'registration_closes_at' => now()->addWeeks(3),
        ]);

        Event::factory()->create([
            'title' => 'Loto',
            'is_public' => true,
            'starts_at' => now()->addWeeks(6),
            'ends_at' => now()->addWeeks(6)->addHours(4),
            // Enabled, but the form does not appear until next month.
            'registration_opens_at' => now()->addWeek(),
            'registration_closes_at' => now()->addWeeks(5),
        ]);

        $response = $this->getJson('/api/v1/agenda')->assertStatus(200);

        $this->assertSame(
            [['Souper de soutien', true], ['Loto', false]],
            array_map(
                fn (array $event): array => [$event['title'], $event['registrationOpen']],
                $response->json('data'),
            ),
        );
    }

    /**
     * An event nobody may book answers `false`, not null and not absent — the
     * ordinary case, and the one every rehearsal-shaped event is in.
     */
    public function test_an_event_that_takes_no_bookings_says_so(): void
    {
        $event = Event::factory()->create([
            'is_public' => true,
            'starts_at' => now()->addWeek(),
            'ends_at' => now()->addWeek()->addHours(2),
        ]);

        $response = $this->getJson('/api/v1/agenda')->assertStatus(200);

        $this->assertSame($event->id, $response->json('data.0.id'));
        $this->assertFalse($response->json('data.0.registrationOpen'));
    }
}
