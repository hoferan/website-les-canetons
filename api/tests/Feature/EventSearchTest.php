<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Searching the planning (#97): `?q=` on GET /events, matching the title or
 * the location, alongside `?past=1`.
 *
 * On the server for the reason MemberSearchTest gives: the envelope slices
 * here, so this is the only side that can see the whole list.
 */
class EventSearchTest extends TestCase
{
    use RefreshDatabase;

    private Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->member = Member::factory()->inSection('Cloches')->create();
    }

    /** @return list<string> the titles the planning answered with */
    private function search(string $query): array
    {
        $body = $this->actingAsMember($this->member)
            ->getJson('/api/v1/events?'.$query)
            ->assertOk()
            ->json();

        $this->assertSame(count($body['data']), $body['meta']['total'], 'meta.total counts the matches');

        $titles = array_column($body['data'], 'title');
        sort($titles);

        return $titles;
    }

    public function test_q_matches_the_title_or_the_location(): void
    {
        Event::factory()->create(['title' => 'Répétition générale', 'location' => 'Werkhof']);
        Event::factory()->create(['title' => 'Cortège', 'location' => 'Place Python']);

        $this->assertSame(['Répétition générale'], $this->search('q=generale'));
        $this->assertSame(['Cortège'], $this->search('q=python'));
    }

    public function test_q_ignores_case_and_accents(): void
    {
        Event::factory()->create(['title' => 'Cortège', 'location' => 'Werkhof']);

        $this->assertSame(['Cortège'], $this->search('q=CORTEGE'));
    }

    public function test_q_combines_with_past(): void
    {
        Event::factory()->create(['title' => 'Concert à venir', 'location' => 'Werkhof']);
        Event::factory()->past()->create(['title' => 'Concert passé', 'location' => 'Werkhof']);
        Event::factory()->past()->create(['title' => 'Répétition', 'location' => 'Werkhof']);

        $this->assertSame(['Concert à venir'], $this->search('q=concert'));
        $this->assertSame(['Concert passé'], $this->search('past=1&q=concert'));
    }

    public function test_an_empty_q_is_no_filter_and_wildcards_are_literal(): void
    {
        Event::factory()->create(['title' => 'Répétition', 'location' => 'Werkhof']);

        $this->assertSame(['Répétition'], $this->search('q='));
        $this->assertSame([], $this->search('q='.rawurlencode('%')));
    }

    public function test_an_over_long_q_is_refused(): void
    {
        $this->actingAsMember($this->member)
            ->getJson('/api/v1/events?q='.str_repeat('a', 101))
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'q')
            ->assertJsonPath('errors.0.reason', 'too_long');
    }
}
