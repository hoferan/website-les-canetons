<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InboxEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_anonymous_is_refused(): void
    {
        $this->getJson('/api/v1/inbox')->assertStatus(401);
        $this->getJson('/api/v1/inbox/summary')->assertStatus(401);
    }

    public function test_the_inbox_lists_open_items(): void
    {
        ContactMessage::factory()->count(2)->create();

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/inbox')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.kind', 'contactMessage');
    }

    public function test_the_inbox_is_newest_first_across_items(): void
    {
        $older = ContactMessage::factory()->create(['created_at' => now()->subDay()]);
        $newer = ContactMessage::factory()->create(['created_at' => now()]);

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/inbox')
            ->assertOk()
            ->assertJsonPath('data.0.id', $newer->id)
            ->assertJsonPath('data.1.id', $older->id);
    }

    public function test_a_member_without_permission_gets_an_empty_inbox_not_a_refusal(): void
    {
        ContactMessage::factory()->count(2)->create();
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->actingAsMember($perrine)
            ->getJson('/api/v1/inbox')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_the_summary_counts_by_kind(): void
    {
        ContactMessage::factory()->count(3)->create();

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/inbox/summary')
            ->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('counts.contactMessage', 3);
    }

    public function test_the_summary_is_empty_for_a_member_who_may_see_nothing(): void
    {
        ContactMessage::factory()->count(3)->create();
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $response = $this->actingAsMember($perrine)
            ->getJson('/api/v1/inbox/summary')
            ->assertOk()
            ->assertJsonPath('total', 0);

        // An empty counts map must serialize as `{}`, never `[]` — a client
        // reading `counts.contactMessage` against an array is a different
        // bug. json_decode() (object mode) only ever produces a stdClass for
        // `{}`; an empty JSON array decodes to a plain PHP array instead.
        $this->assertInstanceOf(\stdClass::class, json_decode($response->getContent())->counts);
    }

    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }
}
