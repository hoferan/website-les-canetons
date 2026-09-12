<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Every timestamp this API emits is UTC.
 *
 * THE DECISION, taken 2026-09-11: the backend works in UTC end to end — the
 * column, the application timezone, and the wire. Europe/Zurich exists only in
 * what a human is shown, which is the SPA's job.
 *
 * THE BUG THIS GUARDS, found by a black-box review the same day:
 * POST /api/v1/events/series builds its times as Europe/Zurich wall-clock — a
 * season must keep the same clock time across the daylight-saving change, which
 * is the entire reason that endpoint takes `H:i` rather than instants — and its
 * 201 therefore rendered `+01:00` while a GET on the very same row rendered
 * `+00:00`. Same instant, same declared EventResource, two spellings. Enough to
 * break anything that caches or diffs events, and enough to make a client that
 * slices the string show the wrong hour.
 *
 * The tests below compare a CREATION response against a READ of the same row,
 * which is the comparison that failed. Asserting only that a read is UTC would
 * have passed throughout.
 */
class UtcRenderingTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
    }

    /**
     * THE REGRESSION. The series generator is the endpoint that reasons in
     * Europe/Zurich internally, so it is the one that used to leak that
     * timezone into its response.
     */
    public function test_a_generated_season_renders_utc_and_matches_a_later_read(): void
    {
        $created = $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', [
                'template' => [
                    'title' => 'Répétition',
                    'location' => 'Werkhof',
                    'isPublic' => false,
                    'startTime' => '20:00',
                    'endTime' => '22:00',
                ],
                // December, so Europe/Zurich is +01:00 and a leak is visible.
                'dates' => ['2026-12-01'],
            ])
            ->assertStatus(201);

        $id = $created->json('data.0.id');
        $fromCreate = $created->json('data.0.startsAt');

        $fromRead = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$id}")
            ->assertOk()
            ->json('startsAt');

        $this->assertSame(
            $fromRead,
            $fromCreate,
            'The creation response and a later read spell the same instant differently.'
        );

        // 20:00 Europe/Zurich in December is 19:00 UTC. Pinning the value, not
        // merely the agreement, so a bug that rendered both wrong the same way
        // could not pass.
        $this->assertSame('2026-12-01T19:00:00+00:00', $fromCreate);
    }

    /**
     * The same property for the ordinary create, which takes an instant with an
     * offset rather than a wall-clock time.
     */
    public function test_an_event_created_with_an_offset_renders_utc(): void
    {
        $created = $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', [
                'title' => 'Concert',
                'location' => 'Fribourg',
                'startsAt' => '2026-12-01T20:00:00+01:00',
                'endsAt' => '2026-12-01T22:00:00+01:00',
                'isPublic' => true,
            ])
            ->assertStatus(201);

        $this->assertSame('2026-12-01T19:00:00+00:00', $created->json('startsAt'));
        $this->assertSame('2026-12-01T21:00:00+00:00', $created->json('endsAt'));
    }

    /**
     * Every timestamp in the planning, not just the two that were wrong. A
     * resource that rendered one field through Instant and forgot another is
     * the obvious next version of this bug.
     */
    public function test_every_event_timestamp_carries_a_utc_offset(): void
    {
        Event::factory()->create([
            'starts_at' => now()->addDays(3),
            'ends_at' => now()->addDays(3)->addHours(2),
            'registration_opens_at' => now()->addDay(),
            'registration_closes_at' => now()->addDays(2),
        ]);

        $event = $this->actingAsMember($this->organiser)
            ->getJson('/api/v1/events')
            ->assertOk()
            ->json('data.0');

        foreach (['startsAt', 'endsAt', 'registrationOpensAt', 'registrationClosesAt'] as $field) {
            $this->assertIsString($event[$field], "{$field} is not rendered at all.");
            $this->assertStringEndsWith(
                '+00:00',
                $event[$field],
                "{$field} is not rendered in UTC."
            );
        }
    }
}
