<?php

namespace Tests\Feature;

use App\Http\Resources\PublicEventResource;
use App\Models\Event;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use LogicException;
use Tests\TestCase;

class EventResourceDraftTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_draft_renders_null_dates_and_a_null_published_at(): void
    {
        $draft = Event::factory()->draft()->create([
            'starts_at' => null,
            'ends_at' => null,
            'location' => null,
        ]);

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->getJson("/api/v1/events/{$draft->id}")
            ->assertOk()
            ->assertJsonPath('publishedAt', null)
            ->assertJsonPath('startsAt', null)
            ->assertJsonPath('endsAt', null)
            ->assertJsonPath('location', null);
    }

    public function test_a_published_event_renders_when_it_was_published(): void
    {
        $event = Event::factory()->create();

        $published = $this->actingAsMember(Member::factory()->administrator()->create())
            ->getJson("/api/v1/events/{$event->id}")
            ->assertOk()
            ->json('publishedAt');

        $this->assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/', $published);
    }

    public function test_the_public_resource_keeps_its_four_fields_non_null_in_the_document(): void
    {
        // The model's types now say startsAt, endsAt and location may be null,
        // and Scramble reads types. The agenda only ever lists published
        // events, so the published contract must not widen with them.
        $document = json_decode(file_get_contents(base_path('openapi.json')), true);
        $schema = $document['components']['schemas']['PublicEventResource'];

        foreach (['startsAt', 'endsAt', 'location'] as $field) {
            $this->assertSame('string', $schema['properties'][$field]['type'] ?? null, "{$field} is not a plain string");
            $this->assertContains($field, $schema['required'], "{$field} is not required");
        }
    }

    public function test_the_public_resource_refuses_to_render_a_draft(): void
    {
        // Loud rather than a null in a document that promises a string. Every
        // route that reaches it hides a draft first.
        $this->expectException(LogicException::class);

        (new PublicEventResource(Event::factory()->draft()->make(['starts_at' => null, 'ends_at' => null, 'location' => null])))->toArray(Request::create('/'));
    }
}
