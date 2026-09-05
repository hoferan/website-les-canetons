<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Member;
use App\Support\Audit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditTest extends TestCase
{
    use RefreshDatabase;

    private function member(string $username): Member
    {
        return Member::create([
            'first_name' => 'Demo',
            'last_name' => ucfirst($username),
            'username' => $username,
            'password' => 'secret123',
        ]);
    }

    public function test_it_records_who_did_what_to_whom(): void
    {
        $actor = $this->member('actor');
        $target = $this->member('target');

        Audit::record($actor, 'member.deleted', 'member', $target->id, $target->fullName());

        $entry = AuditEntry::sole();

        $this->assertSame($actor->id, $entry->actor_member_id);
        $this->assertSame('member.deleted', $entry->action);
        $this->assertSame('member', $entry->target_type);
        $this->assertSame($target->id, $entry->target_id);
        $this->assertSame('Demo Target', $entry->target_label);
    }

    public function test_the_label_survives_the_target_being_deleted(): void
    {
        // The whole point: after a hard delete, target_id points at nothing, so
        // the entry must still say who it was.
        $actor = $this->member('actor');
        $target = $this->member('target');

        Audit::record($actor, 'member.deleted', 'member', $target->id, $target->fullName());
        $target->delete();

        $this->assertSame('Demo Target', AuditEntry::sole()->target_label);
    }

    public function test_deleting_the_actor_keeps_the_entry(): void
    {
        $actor = $this->member('actor');
        $target = $this->member('target');
        Audit::record($actor, 'member.deleted', 'member', $target->id, $target->fullName());

        $actor->delete();

        $entry = AuditEntry::sole();
        $this->assertNull($entry->actor_member_id);
        $this->assertSame('member.deleted', $entry->action);
    }

    public function test_a_systemic_action_may_have_no_actor(): void
    {
        Audit::record(null, 'member.created', 'member', 1, 'Seeded Person');

        $this->assertNull(AuditEntry::sole()->actor_member_id);
    }
}
