<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The two destructive operations on a person: replacing their roles, and
 * deleting them.
 *
 * These are the first callers AccessIntegrity and SessionRevoker have had since
 * R1a built them. Neither re-authenticates — decision B7 trusts the session
 * cookie here, as this API already does for reading the whole roster and
 * editing anyone. Both still check the invariants before writing and revoke
 * sessions inside the same transaction as the change.
 */
class MemberRolesTest extends TestCase
{
    use RefreshDatabase;

    private Member $actor;

    private Role $direction;

    private Role $committee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->direction = Role::where('key', 'direction')->sole();
        $this->committee = Role::where('key', 'committee')->sole();

        $this->actor = $this->administrator('dominique');
    }

    private function administrator(string $username): Member
    {
        return Member::factory()->named('Admin', ucfirst($username), $username)->administrator()->create();
    }

    private function player(string $username = 'perrine'): Member
    {
        return Member::factory()->named('Perrine', 'Player', $username)->create();
    }

    /** Writes a row shaped like Laravel's database session handler's. */
    private function sessionFor(string $id, ?int $memberId): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $memberId,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'phpunit',
            'payload' => base64_encode(serialize([])),
            'last_activity' => time(),
        ]);
    }

    private function acting(?Member $as = null): static
    {
        return $this->actingAsMember($as ?? $this->actor);
    }

    public function test_it_replaces_a_members_roles(): void
    {
        // PUT semantics: roleIds is the COMPLETE set the member is left with.
        $target = $this->player();
        $target->roles()->attach($this->committee);

        $this->acting()->putJson("/api/v1/members/{$target->id}/roles", [
            'roleIds' => [$this->direction->id],
        ])->assertOk();

        $this->assertSame([$this->direction->id], $target->fresh()->roles->pluck('id')->all());
    }

    public function test_an_empty_role_list_removes_every_role(): void
    {
        // The most important value this endpoint accepts, which is why the rule
        // is `present` rather than `required` — `required` rejects an empty
        // array, and removal is the half that needs the invariants.
        $target = $this->player();
        $target->roles()->attach($this->committee);

        $this->acting()->putJson("/api/v1/members/{$target->id}/roles", [
            'roleIds' => [],
        ])->assertOk();

        $this->assertSame([], $target->fresh()->roles->pluck('id')->all());
    }

    public function test_a_role_change_ends_that_members_sessions_immediately(): void
    {
        // A revoked permission that only takes effect at the next login is a
        // permission the holder can keep using all evening.
        $target = $this->player();
        $target->roles()->attach($this->direction);
        $this->sessionFor('target-phone', $target->id);
        $this->sessionFor('target-laptop', $target->id);

        $this->acting()->putJson("/api/v1/members/{$target->id}/roles", [
            'roleIds' => [],
        ])->assertOk();

        $this->assertSame(0, DB::table('sessions')->where('user_id', $target->id)->count());
    }

    public function test_a_role_change_does_not_end_anybody_elses_sessions(): void
    {
        $target = $this->player();
        $bystander = $this->player('bastien');
        $this->sessionFor('target-phone', $target->id);
        $this->sessionFor('bystander-phone', $bystander->id);
        $this->sessionFor('anonymous', null);

        $this->acting()->putJson("/api/v1/members/{$target->id}/roles", [
            'roleIds' => [$this->committee->id],
        ])->assertOk();

        $this->assertDatabaseHas('sessions', ['id' => 'bystander-phone']);
        $this->assertDatabaseHas('sessions', ['id' => 'anonymous']);
    }

    public function test_a_role_change_is_audited(): void
    {
        $target = $this->player();

        $this->acting()->putJson("/api/v1/members/{$target->id}/roles", [
            'roleIds' => [$this->committee->id],
        ])->assertOk();

        $entry = AuditEntry::latest('id')->first();
        $this->assertSame('member.roles_replaced', $entry->action);
        $this->assertSame($this->actor->id, $entry->actor_member_id);
        $this->assertSame('Perrine Player', $entry->target_label);
    }

    public function test_removing_your_own_administration_is_refused(): void
    {
        // Even with a second administrator present, so this is the
        // self-demotion guard and not the orphan one.
        $this->administrator('other');

        $this->acting()->putJson("/api/v1/members/{$this->actor->id}/roles", [
            'roleIds' => [],
        ])->assertStatus(409)->assertJson(['code' => 'cannot_demote_self']);

        $this->assertTrue($this->actor->fresh()->hasPermission(Permission::MembersManage));
    }

    public function test_stripping_the_last_administrator_is_refused(): void
    {
        // The orphan check outranks the self-demotion one when both apply:
        // "you would lock everyone out" is the more informative answer.
        $this->acting()->putJson("/api/v1/members/{$this->actor->id}/roles", [
            'roleIds' => [],
        ])->assertStatus(409)->assertJson(['code' => 'cannot_remove_last_administrator']);
    }

    public function test_deleting_a_member_removes_them_and_ends_their_sessions(): void
    {
        $target = $this->player();
        $this->sessionFor('target-phone', $target->id);
        $this->sessionFor('anonymous', null);

        $this->acting()->deleteJson("/api/v1/members/{$target->id}")->assertOk();

        $this->assertDatabaseMissing('members', ['id' => $target->id]);
        // `sessions` has NO foreign key to members, so without the explicit
        // revoke a deleted member stays logged in until their cookie expires.
        $this->assertSame(0, DB::table('sessions')->where('user_id', $target->id)->count());
        $this->assertDatabaseHas('sessions', ['id' => 'anonymous']);
    }

    public function test_deleting_a_member_is_audited_with_the_name_they_had(): void
    {
        // Captured BEFORE the delete, or the audit records an empty string —
        // the row is gone by the time anyone reads it back.
        $target = $this->player();

        $this->acting()->deleteJson("/api/v1/members/{$target->id}")->assertOk();

        $entry = AuditEntry::latest('id')->first();
        $this->assertSame('member.deleted', $entry->action);
        $this->assertSame('Perrine Player', $entry->target_label);
        $this->assertSame($target->id, $entry->target_id);
    }

    public function test_deleting_yourself_is_refused(): void
    {
        $this->administrator('other');

        $this->acting()->deleteJson("/api/v1/members/{$this->actor->id}")->assertStatus(409)->assertJson(['code' => 'cannot_delete_self']);

        $this->assertDatabaseHas('members', ['id' => $this->actor->id]);
    }

    public function test_deleting_the_last_administrator_is_refused(): void
    {
        $this->acting()->deleteJson("/api/v1/members/{$this->actor->id}")->assertStatus(409)->assertJson(['code' => 'cannot_remove_last_administrator']);
    }

    public function test_a_player_can_do_neither(): void
    {
        $player = $this->player();
        $target = $this->player('someone.else');

        $this->acting($player)->putJson("/api/v1/members/{$target->id}/roles", [
            'roleIds' => [],
        ])->assertStatus(403)->assertJson(['code' => 'access_denied']);

        $this->acting($player)->deleteJson("/api/v1/members/{$target->id}")->assertStatus(403)->assertJson(['code' => 'access_denied']);

        $this->assertDatabaseHas('members', ['id' => $target->id]);
    }
}
