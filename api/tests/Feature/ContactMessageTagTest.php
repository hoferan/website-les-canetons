<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Support\EntityTag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactMessageTagTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_facet_can_be_computed(): void
    {
        $message = ContactMessage::factory()->create();

        $this->assertNotNull(EntityTag::compute('contact_message', $message));
    }

    public function test_the_facet_is_registered(): void
    {
        $this->assertContains('contact_message', EntityTag::facets());
    }

    public function test_two_messages_have_different_tags(): void
    {
        // The hazard this pins: every message stored before this release has
        // `updated_at IS NULL`, so a tag computed over timestamps alone would
        // be identical across all of them, and If-Match would let a write
        // aimed at one succeed against any other. Rendering the resource
        // carries the id, so it cannot.
        $first = ContactMessage::factory()->create();
        $second = ContactMessage::factory()->create();

        $this->assertNotSame(
            EntityTag::compute('contact_message', $first),
            EntityTag::compute('contact_message', $second),
        );
    }

    public function test_handling_a_message_moves_its_tag(): void
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $message = ContactMessage::factory()->create();

        $before = EntityTag::compute('contact_message', $message);

        $message->update(['handled_at' => now(), 'handled_by_member_id' => $camille->id]);

        $this->assertNotSame($before, EntityTag::compute('contact_message', $message));
    }
}
