<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Models\Role;
use App\Support\Inbox\InboxRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InboxRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_open_message_is_an_inbox_item(): void
    {
        $message = ContactMessage::factory()->create(['first_name' => 'Jean', 'last_name' => 'Dupont']);

        $items = app(InboxRegistry::class)->openFor($this->committeeMember());

        $this->assertCount(1, $items);
        $this->assertSame('contactMessage', $items->first()->kind);
        $this->assertStringContainsString('Jean Dupont', $items->first()->title);
        $this->assertSame("/contact-messages?open={$message->id}", $items->first()->path);
    }

    public function test_a_handled_message_leaves_the_inbox(): void
    {
        $camille = $this->committeeMember();
        ContactMessage::factory()->handled($camille)->create();

        $this->assertCount(0, app(InboxRegistry::class)->openFor($camille));
    }

    public function test_a_member_without_the_permission_sees_nothing(): void
    {
        // Filtered, never refused: the nav entry is already hidden from them,
        // and the endpoint must stay safe to call unconditionally.
        ContactMessage::factory()->count(2)->create();
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->assertCount(0, app(InboxRegistry::class)->openFor($perrine));
        $this->assertSame([], app(InboxRegistry::class)->countsFor($perrine));
    }

    public function test_counts_are_keyed_by_kind(): void
    {
        ContactMessage::factory()->count(3)->create();

        $this->assertSame(
            ['contactMessage' => 3],
            app(InboxRegistry::class)->countsFor($this->committeeMember()),
        );
    }

    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }
}
