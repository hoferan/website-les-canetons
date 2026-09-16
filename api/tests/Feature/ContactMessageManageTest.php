<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactMessageManageTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_committee_may_read_but_not_clear(): void
    {
        // The whole point of the split: `committee` sees the enquiry and
        // cannot bin it. If this passes, the two tokens have collapsed into
        // one somewhere.
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->committeeMember())
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => true],
                $this->ifMatch('contact_message', $message))
            ->assertStatus(403);
    }

    public function test_direction_marks_a_message_handled(): void
    {
        $dominique = $this->directionMember();
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($dominique)
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => true],
                $this->ifMatch('contact_message', $message))
            ->assertOk()
            ->assertJsonPath('handledBy', 'Dominique Direction');

        $message->refresh();
        $this->assertNotNull($message->handled_at);
        $this->assertSame($dominique->id, $message->handled_by_member_id);
    }

    public function test_reopening_clears_both_columns(): void
    {
        $dominique = $this->directionMember();
        $message = ContactMessage::factory()->handled($dominique)->create();

        $this->actingAsMember($dominique)
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => false],
                $this->ifMatch('contact_message', $message))
            ->assertOk();

        $message->refresh();
        $this->assertNull($message->handled_at);
        $this->assertNull($message->handled_by_member_id);
    }

    public function test_a_write_without_if_match_is_refused(): void
    {
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->directionMember())
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => true])
            ->assertStatus(428);
    }

    public function test_a_stale_tag_is_refused(): void
    {
        $dominique = $this->directionMember();
        $message = ContactMessage::factory()->create();
        $stale = $this->ifMatch('contact_message', $message);

        // Somebody else got there first.
        $message->update(['handled_at' => now(), 'handled_by_member_id' => $dominique->id]);

        $this->actingAsMember($dominique)
            ->deleteJson("/api/v1/contact-messages/{$message->id}", [], $stale)
            ->assertStatus(412);

        $this->assertDatabaseHas('contact_messages', ['id' => $message->id]);
    }

    public function test_direction_deletes_a_message(): void
    {
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->directionMember())
            ->deleteJson("/api/v1/contact-messages/{$message->id}", [],
                $this->ifMatch('contact_message', $message))
            ->assertNoContent();

        $this->assertDatabaseMissing('contact_messages', ['id' => $message->id]);
    }

    public function test_handled_must_be_a_boolean(): void
    {
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->directionMember())
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => 'yes please'],
                $this->ifMatch('contact_message', $message))
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed');
    }

    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }

    private function directionMember(): Member
    {
        $dominique = Member::factory()->named('Dominique', 'Direction', 'dominique')->create();
        $dominique->roles()->attach(Role::where('key', 'direction')->sole());

        return $dominique;
    }
}
