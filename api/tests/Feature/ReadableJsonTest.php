<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Asserted on the raw body, not on the decoded array.
 *
 * Every assertion helper in the framework decodes the response first, and
 * after decoding `"R\u00e9p\u00e9tition"` and `"Répétition"` are the same
 * string. A test written through json() would pass with the middleware deleted.
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
     * Event titles, locations and notes are French, and escaping turns each
     * accented character from two bytes into six.
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
     * Raw UTF-8 has to survive the round trip. This is the one test that
     * decodes, on purpose.
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
