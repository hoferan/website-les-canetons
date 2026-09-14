<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Asserted on the RAW BODY, not on the decoded array.
 *
 * That is the whole point and the only way this can be tested at all: every
 * assertion helper in the framework decodes the response first, and after
 * decoding `"Répétition"` and `"Répétition"` are the same string.
 * A test written through json() would pass with the middleware deleted.
 */
class ReadableJsonTest extends TestCase
{
    use RefreshDatabase;

    public function test_paths_are_not_slash_escaped(): void
    {
        $body = $this->getJson('/api/v1/me')->assertStatus(401)->getContent();

        $this->assertStringContainsString('"instance":"/api/v1/me"', (string) $body);
        $this->assertStringNotContainsString('\\/', (string) $body);
    }

    /**
     * The one with a measurable cost. Every event title, location and note in
     * this API is French; escaping turns each accented character from two bytes
     * into six.
     */
    public function test_french_content_is_not_unicode_escaped(): void
    {
        $member = Member::factory()->inSection('Cloches')->create();
        Event::factory()->create([
            'title' => 'Répétition générale',
            'starts_at' => now()->addDays(3),
        ]);

        $body = (string) $this->actingAsMember($member)
            ->getJson('/api/v1/events')
            ->assertOk()
            ->getContent();

        $this->assertStringContainsString('Répétition générale', $body);
        $this->assertStringNotContainsString('\\u00e9', $body);
    }

    /**
     * Raw UTF-8 has to survive the round trip, or this middleware would be
     * trading bytes for corruption. Decoding is the check the assertions above
     * deliberately avoid, so it is made once, here, on purpose.
     */
    public function test_the_content_still_decodes_to_the_same_string(): void
    {
        $member = Member::factory()->inSection('Cloches')->create();
        Event::factory()->create([
            'title' => 'Répétition générale',
            'starts_at' => now()->addDays(3),
        ]);

        $decoded = $this->actingAsMember($member)
            ->getJson('/api/v1/events')
            ->assertOk()
            ->json('data.0.title');

        $this->assertSame('Répétition générale', $decoded);
    }
}
