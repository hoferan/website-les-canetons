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
        $this->admins = Role::factory()->granting(Permission::MembersManage)->create();
        $this->plain = Role::factory()->granting(Permission::EventsManage)->create();
    }

    private function member(string $username, ?Role $role = null): Member
    {
        $factory = Member::factory()->named('Demo', ucfirst($username), $username);

        return ($role !== null ? $factory->withRole($role) : $factory)->create();
    }

    /**
     * A complete role list for assertMayReplaceRoles(): the baseline, which
     * nobody may lose, plus the given roles.
     *
     * @return array<int, int>
     */
    private function keeping(Role ...$roles): array
    {
        return [Role::baseline()->id, ...array_map(fn (Role $role): int => $role->id, $roles)];
    }

    private function assertRefusedWith(string $code, callable $write): void
    {
        try {
            $write();
            $this->fail("Expected AccessIntegrityViolation {$code}");
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame($code, $e->errorCode);
        }
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
        AccessIntegrity::assertMayReplaceRoles($actor, $only, $this->keeping($this->plain));
    }

    public function test_nobody_may_strip_their_own_administration(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('spare', $this->admins);

        $this->assertRefusedWith('cannot_demote_self', fn () => AccessIntegrity::assertMayReplaceRoles($actor, $actor, $this->keeping($this->plain)));
    }

    public function test_a_sole_administrator_demoting_themselves_gets_the_last_administrator_code(): void
    {
        $only = $this->member('only', $this->admins);

        // Both conditions apply here: $only is the sole administrator, AND is
        // acting on themselves. The orphan check must win; see the ordering
        // comment in AccessIntegrity::assertAdministrationSurvives().
        $this->assertRefusedWith('cannot_remove_last_administrator', fn () => AccessIntegrity::assertMayReplaceRoles($only, $only, $this->keeping($this->plain)));
    }

    public function test_keeping_only_the_baseline_on_the_sole_administrator_is_refused(): void
    {
        $only = $this->member('only', $this->admins);

        $this->assertRefusedWith('cannot_remove_last_administrator', fn () => AccessIntegrity::assertMayReplaceRoles($only, $only, $this->keeping()));
    }

    public function test_keeping_only_the_baseline_on_a_non_administrator_is_allowed(): void
    {
        // The assertion IS that the call returns rather than throwing.
        // expectNotToPerformAssertions() says so honestly; assertTrue(true)
        // would only be silencing PHPUnit's risky-test warning.
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);
        $target = $this->member('target', $this->plain);

        AccessIntegrity::assertMayReplaceRoles($actor, $target, $this->keeping());
    }

    public function test_keeping_administration_while_adding_a_role_is_allowed(): void
    {
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);

        AccessIntegrity::assertMayReplaceRoles($actor, $actor, $this->keeping($this->admins, $this->plain));
    }

    // ------------------------------------------------------------ the baseline

    public function test_the_baseline_role_cannot_be_taken_from_a_member(): void
    {
        // Not an empty list: a list that still holds a role, just not the
        // baseline, so a check written as `$roleIds === []` cannot pass this.
        $actor = $this->member('actor', $this->admins);
        $target = $this->member('target', $this->plain);

        $this->assertRefusedWith('baseline_role_is_fixed', fn () => AccessIntegrity::assertMayReplaceRoles($actor, $target, [$this->plain->id]));
    }

    public function test_the_baseline_roles_permissions_cannot_be_replaced(): void
    {
        // Adding to it is refused as firmly as taking away: a permission given
        // to the baseline is given to every account at once.
        $actor = $this->member('actor', $this->admins);
        $baseline = Role::baseline();

        $this->assertRefusedWith('baseline_role_is_fixed', fn () => AccessIntegrity::assertMayReplacePermissions(
            $actor,
            $baseline,
            [...$baseline->permissions()->all(), Permission::EventsManage],
        ));
    }

    public function test_the_baseline_role_cannot_be_deleted(): void
    {
        $actor = $this->member('actor', $this->admins);

        $this->assertRefusedWith('baseline_role_is_fixed', fn () => AccessIntegrity::assertMayDeleteRole($actor, Role::baseline()));
    }

    // ------------------------------------------------- what a role grants

    public function test_taking_members_manage_from_the_only_role_granting_it_is_refused_though_two_people_hold_it(): void
    {
        // Two holders, so a count of PEOPLE says administration survives. It
        // does not: both hold it through this one role. The actor is one of
        // the two, so the self-demotion applies as well and the orphan code
        // must still win.
        $actor = $this->member('actor', $this->admins);
        $this->member('other', $this->admins);

        $this->assertRefusedWith('cannot_remove_last_administrator', fn () => AccessIntegrity::assertMayReplacePermissions($actor, $this->admins, [Permission::EventsManage]));
    }

    public function test_the_sole_administrator_may_edit_a_role_that_keeps_members_manage(): void
    {
        // The edited role is replaced wholesale, so the new list has to be
        // read for members.manage; reading only the stored grants and dropping
        // the edited role from them would orphan administration here.
        $this->expectNotToPerformAssertions();

        $only = $this->member('only', $this->admins);

        AccessIntegrity::assertMayReplacePermissions($only, $this->admins, [Permission::MembersManage, Permission::EventsManage]);
    }

    public function test_taking_members_manage_from_a_role_is_allowed_while_another_role_grants_it(): void
    {
        $this->expectNotToPerformAssertions();

        $otherAdmins = Role::factory()->granting(Permission::MembersManage)->create();
        $actor = $this->member('actor', $otherAdmins);
        $this->member('other', $this->admins);

        AccessIntegrity::assertMayReplacePermissions($actor, $this->admins, [Permission::EventsManage]);
    }

    public function test_an_account_cannot_take_members_manage_from_its_own_role(): void
    {
        // Somebody else keeps administration through a second role, so this
        // is the self-demotion guard and not the orphan one.
        $actor = $this->member('actor', $this->admins);
        $this->member('keeper', Role::factory()->granting(Permission::MembersManage)->create());

        $this->assertRefusedWith('cannot_demote_self', fn () => AccessIntegrity::assertMayReplacePermissions($actor, $this->admins, []));
    }

    public function test_an_account_without_members_manage_is_not_demoted_by_a_role_edit(): void
    {
        // The role editor will be gated on its own permission (#194), so its
        // caller need not administer members. Such a caller has nothing to be
        // demoted from; only losing members.manage they HELD is a demotion.
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->plain);
        $this->member('other', $this->admins);

        AccessIntegrity::assertMayReplacePermissions($actor, $this->plain, []);
    }

    public function test_an_account_may_edit_its_own_role_while_another_of_its_roles_keeps_administration(): void
    {
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);
        $actor->roles()->attach(Role::factory()->granting(Permission::MembersManage)->create());

        AccessIntegrity::assertMayReplacePermissions($actor, $this->admins, [Permission::EventsManage]);
    }

    // ------------------------------------------------------ deleting a role

    public function test_deleting_the_only_role_granting_members_manage_is_refused(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('other', $this->admins);

        $this->assertRefusedWith('cannot_remove_last_administrator', fn () => AccessIntegrity::assertMayDeleteRole($actor, $this->admins));
    }

    public function test_an_account_cannot_delete_the_role_it_administers_through(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('keeper', Role::factory()->granting(Permission::MembersManage)->create());

        $this->assertRefusedWith('cannot_demote_self', fn () => AccessIntegrity::assertMayDeleteRole($actor, $this->admins));
    }

    public function test_deleting_a_role_is_allowed_while_administration_survives(): void
    {
        $this->expectNotToPerformAssertions();

        $otherAdmins = Role::factory()->granting(Permission::MembersManage)->create();
        $actor = $this->member('actor', $otherAdmins);
        $this->member('other', $this->admins);

        AccessIntegrity::assertMayDeleteRole($actor, $this->admins);
    }

    public function test_a_violation_renders_as_409_in_the_error_contract(): void
    {
        Route::middleware('api')->get(
            '/api/v1/_test/violation',
            fn () => throw new AccessIntegrityViolation('cannot_delete_self', 'Cannot delete self'),
        );

        $this->getJson('/api/v1/_test/violation')
            ->assertStatus(409)
            ->assertJson(['code' => 'cannot_delete_self']);
    }
}
