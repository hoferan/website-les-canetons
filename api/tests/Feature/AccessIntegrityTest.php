<?php

namespace Tests\Feature;

use App\Exceptions\AccessIntegrityViolation;
use App\Models\Member;
use App\Models\Role;
use App\Support\AccessIntegrity;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AccessIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private Role $admins;

    private Role $plain;

    protected function setUp(): void
    {
        parent::setUp();

        // FIXTURE KEYS, not 'direction'/'committee'. Those two are reference
        // data now, seeded by the 2026_09_07_000001 migration that
        // RefreshDatabase runs, so re-creating them here is a duplicate-key
        // error. Reading the seeded ones instead would be worse: this suite
        // needs a role granting exactly one permission (below, `plain` grants
        // events.manage, which the real committee role does not), and roles
        // are editable data — a committee changing what `direction` grants
        // must not turn this suite red.
        $this->admins = Role::create(['key' => 'fixture-admins']);
        $this->admins->syncPermissions([Permission::MembersManage]);

        $this->plain = Role::create(['key' => 'fixture-plain']);
        $this->plain->syncPermissions([Permission::EventsManage]);
    }

    private function member(string $username, ?Role $role = null): Member
    {
        $member = Member::create([
            'first_name' => 'Demo',
            'last_name' => ucfirst($username),
            'username' => $username,
            'password' => 'secret123',
        ]);

        if ($role !== null) {
            $member->roles()->attach($role);
        }

        return $member;
    }

    public function test_the_last_administrator_cannot_be_deleted(): void
    {
        $only = $this->member('only', $this->admins);
        $other = $this->member('other', $this->admins);

        // Two exist, so removing one is fine.
        AccessIntegrity::assertMayDelete($only, $other);

        $other->delete();

        $this->expectException(AccessIntegrityViolation::class);
        AccessIntegrity::assertMayDelete($only, $only->fresh());
    }

    public function test_the_violation_carries_the_last_administrator_code(): void
    {
        $only = $this->member('only', $this->admins);

        try {
            AccessIntegrity::assertMayDelete($only, $only);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_remove_last_administrator', $e->errorCode);

            // Exception::$code is inherited, untyped, and expected by the
            // wider PHP ecosystem to stay an int — it must NOT be shadowed
            // with the machine token above. Pins the fix; don't "simplify"
            // the property back to `code`.
            $this->assertSame(0, $e->getCode());
        }
    }

    public function test_nobody_may_delete_themselves(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('spare', $this->admins);

        try {
            AccessIntegrity::assertMayDelete($actor, $actor);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_delete_self', $e->errorCode);
        }
    }

    public function test_a_member_without_the_permission_may_be_deleted_freely(): void
    {
        // The assertion IS that the call returns rather than throwing.
        // expectNotToPerformAssertions() says so honestly; assertTrue(true)
        // would only be silencing PHPUnit's risky-test warning.
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);
        $target = $this->member('target', $this->plain);

        AccessIntegrity::assertMayDelete($actor, $target);
    }

    public function test_the_last_administrator_cannot_be_demoted(): void
    {
        $actor = $this->member('actor', $this->admins);
        $only = $this->member('only', $this->admins);
        $actor->roles()->detach($this->admins);

        $this->expectException(AccessIntegrityViolation::class);
        AccessIntegrity::assertMayReplaceRoles($actor, $only, [$this->plain->id]);
    }

    public function test_nobody_may_strip_their_own_administration(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('spare', $this->admins);

        try {
            AccessIntegrity::assertMayReplaceRoles($actor, $actor, [$this->plain->id]);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_demote_self', $e->errorCode);
        }
    }

    public function test_a_sole_administrator_demoting_themselves_gets_the_last_administrator_code(): void
    {
        $only = $this->member('only', $this->admins);

        try {
            AccessIntegrity::assertMayReplaceRoles($only, $only, [$this->plain->id]);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            // Both conditions apply here: $only is the sole administrator,
            // AND is acting on themselves. The orphan check must win —
            // see the ordering comment in assertMayReplaceRoles().
            $this->assertSame('cannot_remove_last_administrator', $e->errorCode);
        }
    }

    public function test_replacing_with_an_empty_role_list_on_the_sole_administrator_is_refused(): void
    {
        $only = $this->member('only', $this->admins);

        try {
            AccessIntegrity::assertMayReplaceRoles($only, $only, []);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_remove_last_administrator', $e->errorCode);
        }
    }

    public function test_replacing_with_an_empty_role_list_on_a_non_administrator_is_allowed(): void
    {
        // The assertion IS that the call returns rather than throwing.
        // expectNotToPerformAssertions() says so honestly; assertTrue(true)
        // would only be silencing PHPUnit's risky-test warning.
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);
        $target = $this->member('target', $this->plain);

        AccessIntegrity::assertMayReplaceRoles($actor, $target, []);
    }

    public function test_keeping_administration_while_adding_a_role_is_allowed(): void
    {
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);

        AccessIntegrity::assertMayReplaceRoles(
            $actor,
            $actor,
            [$this->admins->id, $this->plain->id],
        );
    }

    public function test_a_violation_renders_as_409_in_the_error_contract(): void
    {
        Route::middleware('api')->get(
            '/api/_test/violation',
            fn () => throw new AccessIntegrityViolation('cannot_delete_self', 'Cannot delete self'),
        );

        $this->getJson('/api/_test/violation')
            ->assertStatus(409)
            ->assertJson(['code' => 'cannot_delete_self']);
    }

    /**
     * A member row is a PERSON, not an account: username and password are
     * nullable so an instructor on the public page, or a child whose parent
     * answers, needs no login. Somebody holding members.manage who cannot log
     * in administers nothing, so they must not be the reason a deletion is
     * allowed.
     */
    private function ghostAdministrator(): Member
    {
        $member = Member::create([
            'first_name' => 'Ghost',
            'last_name' => 'Administrator',
        ]);
        $member->roles()->attach($this->admins);

        return $member;
    }

    public function test_a_credential_less_administrator_does_not_count_as_one(): void
    {
        // The actor IS the last reachable administrator, deleting themselves,
        // with a credential-less holder also present. That overlap is what
        // discriminates: WITHOUT the credential filter the ghost keeps the
        // count non-empty, so this falls through to cannot_delete_self and the
        // lockout is permitted. WITH it, the orphan check wins — which is also
        // the priority test_the_violation_carries_the_last_administrator_code
        // pins.
        $only = $this->member('only', $this->admins);
        $this->ghostAdministrator();

        try {
            AccessIntegrity::assertMayDelete($only, $only);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_remove_last_administrator', $e->errorCode);
        }
    }

    public function test_stripping_the_last_reachable_administrators_roles_is_refused(): void
    {
        // Same overlap as above: without the credential filter this is merely
        // a self-demotion (cannot_demote_self) and is allowed to orphan
        // administration behind a member who cannot log in.
        $only = $this->member('only', $this->admins);
        $this->ghostAdministrator();

        try {
            AccessIntegrity::assertMayReplaceRoles($only, $only, []);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_remove_last_administrator', $e->errorCode);
        }
    }

    public function test_removing_the_credentials_of_the_last_administrator_is_refused(): void
    {
        // The lockout this closes: PATCH /api/members/{id} can clear a
        // username, and no other invariant looks at credentials. Without this,
        // "edit this person and blank their username" is a lockout with none of
        // the ceremony deleting them would have required — and the host has no
        // shell, so the repair is Adminer.
        $only = $this->member('only', $this->admins);

        try {
            AccessIntegrity::assertMayRemoveCredentials($only);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_remove_last_administrator', $e->errorCode);
        }
    }

    public function test_removing_the_credentials_of_a_player_is_fine(): void
    {
        // An administrator must exist, or this hits wouldOrphanAdministration's
        // documented "nobody holds members.manage at all" branch, which refuses
        // everything. The real controller is gated on members.manage, so one
        // always does.
        $this->member('admin', $this->admins);

        AccessIntegrity::assertMayRemoveCredentials($this->member('perrine'));

        $this->expectNotToPerformAssertions();
    }

    public function test_removing_credentials_is_fine_while_another_administrator_can_log_in(): void
    {
        // An outgoing committee member who stays on the public roster as a
        // person is the legitimate case, and refusing it would be wrong.
        $leaving = $this->member('leaving', $this->admins);
        $this->member('staying', $this->admins);

        AccessIntegrity::assertMayRemoveCredentials($leaving);

        $this->expectNotToPerformAssertions();
    }
}
