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
 * R1c-1 and meant nothing until this endpoint, which is why these tests lean
 * on it harder than the shape: a filter that silently stopped working would
 * publish the band's whole rehearsal schedule, addresses included, to anybody.
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
     * Four fields, and not one of them internal. `notes` is the committee's
     * own note and `isPublic` is the decision itself — publishing either would
     * tell a visitor things about the band's diary that the filter above is
     * there to keep out.
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
            ['title', 'startsAt', 'endsAt', 'location'],
            array_keys($response->json('data.0')),
        );
        $response->assertDontSee('parapluies');
    }
}
