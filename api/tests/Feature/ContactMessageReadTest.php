<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactMessageReadTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        // 401 rather than 403, so a caller is told to log in rather than told
        // they are not allowed — see the note in CLAUDE.md on pairing
        // auth:sanctum with permission:.
        $this->getJson('/api/v1/contact-messages')->assertStatus(401);
    }

    public function test_a_plain_member_is_refused(): void
    {
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->actingAsMember($perrine)
            ->getJson('/api/v1/contact-messages')
            ->assertStatus(403);
    }

    public function test_the_committee_reads_the_messages(): void
    {
        ContactMessage::factory()->count(3)->create();

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/contact-messages')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('meta.total', 3);
    }

    public function test_the_newest_message_comes_first(): void
    {
        $old = ContactMessage::factory()->create(['created_at' => now()->subDays(3)]);
        $new = ContactMessage::factory()->create(['created_at' => now()]);

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/contact-messages')
            ->assertOk()
            ->assertJsonPath('data.0.id', $new->id)
            ->assertJsonPath('data.1.id', $old->id);
    }

    public function test_the_list_can_be_filtered_to_open_or_handled(): void
    {
        $camille = $this->committeeMember();
        $open = ContactMessage::factory()->create();
        $done = ContactMessage::factory()->handled($camille)->create();

        $this->actingAsMember($camille)
            ->getJson('/api/v1/contact-messages?handled=0')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $open->id);

        $this->actingAsMember($camille)
            ->getJson('/api/v1/contact-messages?handled=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $done->id);
    }

    public function test_reading_one_message_hands_out_its_tag(): void
    {
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->committeeMember())
            ->getJson("/api/v1/contact-messages/{$message->id}")
            ->assertOk()
            ->assertHeader('ETag')
            // Bare, not `data.message`: single-resource reads in this API are
            // unwrapped (JsonResource::withoutWrapping() in AppServiceProvider) —
            // the {data, meta} envelope is only for endpoints that answer with a
            // list, per PaginatesCollections. Every other show() test in this
            // suite (e.g. EventIndexTest::assertJsonPath('title', …)) reads a
            // field the same way.
            ->assertJsonPath('message', $message->message);
    }

    /** Holds messages.view through the `committee` role, and nothing more. */
    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }
}
