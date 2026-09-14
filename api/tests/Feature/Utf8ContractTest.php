<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The backend is UTF-8 end to end.
 *
 * A French band's API carries accented text in almost every user-supplied
 * field — event titles, locations, attire, notes, guest names — so this is not
 * an edge case, it is the normal case. The properties worth pinning are the
 * ones that fail SILENTLY and only for some inputs, which is what makes
 * encoding bugs expensive: they survive every test written in ASCII.
 *
 * THE FOUR-BYTE CHARACTER IS THE LOAD-BEARING ONE. MySQL's `utf8` is three
 * bytes and silently truncates or rejects anything outside the basic plane;
 * only `utf8mb4` stores an emoji. So a round trip that includes one proves the
 * connection, the column and the response encoder are all really utf8mb4 —
 * whereas a test using only `é` would pass on a three-byte column and tell you
 * nothing.
 */
class Utf8ContractTest extends TestCase
{
    use RefreshDatabase;

    /** French, German, a typographic dash, and a 4-byte emoji. */
    private const AWKWARD = 'Répétition à Fribourg — Grüezi 🎺';

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
    }

    public function test_awkward_text_survives_a_write_and_a_read_unchanged(): void
    {
        $created = $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', [
                'title' => self::AWKWARD,
                'location' => 'Werkhof, Fribourg — cave',
                'startsAt' => '2026-12-02T20:00:00+01:00',
                'endsAt' => '2026-12-02T22:00:00+01:00',
                'isPublic' => false,
            ])
            ->assertStatus(201);

        $this->assertSame(self::AWKWARD, $created->json('title'));

        // Read back through a separate request, so this cannot pass on a value
        // that never left PHP's memory.
        $this->actingAsMember($this->organiser)
            ->getJson('/api/v1/events/'.$created->json('id'))
            ->assertOk()
            ->assertJsonPath('title', self::AWKWARD);
    }

    /**
     * Asserted on the RAW BODY, because every assertion helper decodes first —
     * and after decoding, escaped and unescaped spellings are the same string.
     * A test written through json() would pass with the encoder emitting
     * `é` sequences.
     */
    public function test_the_response_carries_raw_utf8_not_escape_sequences(): void
    {
        $created = $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', [
                'title' => self::AWKWARD,
                'location' => 'Werkhof',
                'startsAt' => '2026-12-02T20:00:00+01:00',
                'endsAt' => '2026-12-02T22:00:00+01:00',
                'isPublic' => false,
            ])
            ->assertStatus(201);

        $body = (string) $created->getContent();

        $this->assertStringContainsString(self::AWKWARD, $body);
        $this->assertStringNotContainsString('\\u00e9', $body);
        $this->assertTrue(
            mb_check_encoding($body, 'UTF-8'),
            'The response body is not valid UTF-8.'
        );
    }

    /**
     * A body that is not valid UTF-8 must not reach the database or crash the
     * request. PHP's json_decode rejects it, so the payload arrives empty and
     * validation refuses it.
     *
     * The message it produces is imperfect — it reports the fields as MISSING
     * rather than the body as unparseable — and that is accepted rather than
     * unnoticed: the failure is safe, documented here, and distinguishing the
     * two cases would mean inspecting the raw body before Laravel parses it.
     * What matters is that it is a clean 400 rather than a 500 or a partial
     * write.
     */
    public function test_a_body_that_is_not_valid_utf8_is_refused_cleanly(): void
    {
        $response = $this->actingAsMember($this->organiser)->call(
            'POST',
            '/api/v1/events',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'],
            '{"title":"bad '.chr(0xFF).chr(0xFE).'","location":"X","isPublic":false}'
        );

        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('application/problem+json', $response->headers->get('Content-Type'));

        $body = (string) $response->getContent();
        $this->assertStringNotContainsString('"exception"', $body);
        $this->assertStringNotContainsString('"trace"', $body);

        $this->assertDatabaseCount('events', 0);
    }

    /**
     * Accented text counts CHARACTERS, not bytes, against a length limit.
     *
     * `é` is two bytes in UTF-8, so a byte-counting `max:255` would refuse a
     * 200-character French title. Laravel counts characters when mbstring is
     * present — this pins that it is, on this stack, because the failure mode
     * is a French-only bug nobody writing English tests would see.
     */
    public function test_length_limits_count_characters_not_bytes(): void
    {
        // 200 two-byte characters: 200 chars, 400 bytes. Under a 255-character
        // limit, over a 255-byte one.
        $title = str_repeat('é', 200);

        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', [
                'title' => $title,
                'location' => 'Werkhof',
                'startsAt' => '2026-12-02T20:00:00+01:00',
                'endsAt' => '2026-12-02T22:00:00+01:00',
                'isPublic' => false,
            ])
            ->assertStatus(201)
            ->assertJsonPath('title', $title);
    }
}
