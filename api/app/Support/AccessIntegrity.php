<?php

namespace App\Support;

use App\Exceptions\AccessIntegrityViolation;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Support\Facades\DB;

/**
 * The invariants that keep member administration recoverable.
 *
 * Three failure modes these exist to prevent, each of which ends with someone
 * needing database access to repair a website, on a host with no shell:
 *
 *   1. The last holder of members.manage loses it, and nobody can administer
 *      members any more.
 *   2. An administrator removes their own administration and cannot undo it.
 *   3. An account loses the baseline role, and with it the planning and its
 *      own password, or the baseline changes for every account at once.
 *
 * ONE RULE FOR EVERY PATH. Who holds members.manage changes when a member's
 * roles are replaced, when a member is deleted, when a role's permissions are
 * replaced and when a role is deleted. Each public method below describes its
 * write as the state it would leave and hands that to
 * assertAdministrationSurvives(), so the four cannot drift into four rules.
 * Only the first two have an endpoint so far. The other two wait for the role
 * editor (#194).
 *
 * These are deliberately NOT permission checks — the caller has the permission.
 * They are state checks, which is why they raise 409 rather than 403.
 */
final class AccessIntegrity
{
    public static function assertMayDelete(Member $actor, Member $target): void
    {
        // The orphan check runs FIRST, deliberately. When the actor is deleting
        // themselves AND they are the last administrator, both conditions
        // are true — and "you'd lock everyone out" is the more informative
        // and more severe of the two, so it must win. Pinned by
        // test_the_violation_carries_the_last_administrator_code, which
        // exercises exactly that overlap.
        self::assertAdministrationSurvives($actor, memberRoles: [$target->id => null]);

        if ($actor->id === $target->id) {
            throw new AccessIntegrityViolation(
                'cannot_delete_self',
                'A member cannot delete their own account',
            );
        }
    }

    /**
     * @param  array<int, int>  $roleIds  the roles the target would be left with
     */
    public static function assertMayReplaceRoles(Member $actor, Member $target, array $roleIds): void
    {
        // Adding the baseline back quietly would answer 200 to a request that
        // did not do what it said. An empty list used to mean "remove every
        // role", and a client still sending one is asking for a state this API
        // no longer produces.
        if (! in_array(Role::baseline()->id, $roleIds, true)) {
            self::refuseBaseline();
        }

        self::assertAdministrationSurvives($actor, memberRoles: [$target->id => $roleIds]);
    }

    /**
     * @param  array<int, Permission>  $permissions  everything the role would grant
     */
    public static function assertMayReplacePermissions(Member $actor, Role $role, array $permissions): void
    {
        // Any change is refused, additions included: every account holds
        // whatever the baseline grants, so one save would hand a permission to
        // the whole band.
        if ($role->is_baseline) {
            self::refuseBaseline();
        }

        self::assertAdministrationSurvives($actor, rolePermissions: [$role->id => $permissions]);
    }

    public static function assertMayDeleteRole(Member $actor, Role $role): void
    {
        if ($role->is_baseline) {
            self::refuseBaseline();
        }

        // A deleted role and a role granting nothing leave the same people
        // holding the same permissions, so deletion is described as the latter.
        self::assertAdministrationSurvives($actor, rolePermissions: [$role->id => []]);
    }

    /**
     * The shared rule: after the write, somebody still holds members.manage,
     * and the actor has not taken it from themselves.
     *
     * The orphan refusal outranks the self-demotion one when both apply, for
     * the reason assertMayDelete() gives.
     *
     * roles.manage joins members.manage here with the role editor (#194), so
     * that nobody can remove the permission that lets them undo the edit.
     *
     * @param  array<int, array<int, int>|null>  $memberRoles  member id => the roles they would hold, or null once deleted
     * @param  array<int, array<int, Permission>>  $rolePermissions  role id => what it would grant
     */
    private static function assertAdministrationSurvives(
        Member $actor,
        array $memberRoles = [],
        array $rolePermissions = [],
    ): void {
        $after = self::holders(Permission::MembersManage, $memberRoles, $rolePermissions);

        // This also refuses when nobody held members.manage in the first
        // place. A controller cannot reach that state (every caller is gated
        // on members.manage), but a seeder or console command calling in
        // against such a database would find every write refused.
        if ($after === []) {
            throw new AccessIntegrityViolation(
                'cannot_remove_last_administrator',
                'This is the last member who can administer members',
            );
        }

        // A deleted actor is not demoted; assertMayDelete() has its own
        // refusal for that, and it must be the one the caller sees.
        $actorRemains = ! array_key_exists($actor->id, $memberRoles) || $memberRoles[$actor->id] !== null;
        $heldBefore = in_array($actor->id, self::holders(Permission::MembersManage), true);

        if ($actorRemains && $heldBefore && ! in_array($actor->id, $after, true)) {
            throw new AccessIntegrityViolation(
                'cannot_demote_self',
                'A member cannot remove their own member administration',
            );
        }
    }

    /**
     * The ids of the members who would hold a permission, once the given
     * changes are applied over what is stored. With no changes, who holds it
     * now.
     *
     * No credential filter, deliberately. It had one — members rows used to
     * allow nullable credentials, so somebody could hold members.manage while
     * being unable to log in, and counting such a row let this sequence lock
     * the band out: two administrators, delete one, blank the other's
     * username. 2026_09_08_000001 made credentials NOT NULL, so every holder
     * can authenticate by construction and the filter became a branch no test
     * could reach. The schema is the guard now — see
     * MemberIndexTest::test_every_member_has_an_account.
     *
     * @param  array<int, array<int, int>|null>  $memberRoles
     * @param  array<int, array<int, Permission>>  $rolePermissions
     * @return array<int, int>
     */
    private static function holders(Permission $permission, array $memberRoles = [], array $rolePermissions = []): array
    {
        $granting = EffectivePermissions::roleIdsGranting($permission)
            ->reject(fn (int $roleId): bool => array_key_exists($roleId, $rolePermissions));

        foreach ($rolePermissions as $roleId => $permissions) {
            if (in_array($permission, $permissions, true)) {
                $granting->push($roleId);
            }
        }

        $granting = $granting->all();

        $holders = DB::table('member_roles')
            ->whereIn('role_id', $granting)
            ->whereNotIn('member_id', array_keys($memberRoles))
            ->distinct()
            ->pluck('member_id')
            ->map(fn ($id): int => (int) $id)
            ->all();

        foreach ($memberRoles as $memberId => $roleIds) {
            if ($roleIds !== null && array_intersect($roleIds, $granting) !== []) {
                $holders[] = $memberId;
            }
        }

        return $holders;
    }

    private static function refuseBaseline(): never
    {
        throw new AccessIntegrityViolation(
            'baseline_role_is_fixed',
            'The baseline role is held by every account and grants a fixed set of permissions',
        );
    }
}
