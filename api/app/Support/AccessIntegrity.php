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
 *   1. The last holder of members.manage or roles.manage loses it, and nobody
 *      can administer members, or roles, any more.
 *   2. An administrator removes their own administration and cannot undo it.
 *   3. An account loses the baseline role, and with it the planning and its
 *      own password, or the baseline changes for every account at once.
 *
 * Who holds a permission changes when a member's roles are replaced, when a
 * member is deleted, when a role's permissions are replaced and when a role is
 * deleted. Each public method below describes its write as the state it would
 * leave and hands that to assertAdministrationSurvives(), so the four paths
 * share one rule.
 *
 * These are state checks, not permission checks (the caller has the
 * permission), which is why they raise 409 rather than 403.
 */
final class AccessIntegrity
{
    /** The permissions that must keep a holder, in the order they are checked. */
    private const GUARDED = [Permission::MembersManage, Permission::RolesManage];

    public static function assertMayDelete(Member $actor, Member $target): void
    {
        // The orphan check runs first. When the actor is deleting themselves
        // and is the last administrator, both conditions hold, and "you'd lock
        // everyone out" is the more informative and more severe refusal.
        // Pinned by test_the_violation_carries_the_last_administrator_code.
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
        // did not do what it said.
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

    /**
     * Renaming changes nobody's permissions, so only the baseline is checked:
     * the editor offers it read-only, whole, rather than fixed in what it
     * grants and editable in what it is called.
     */
    public static function assertMayRename(Role $role): void
    {
        if ($role->is_baseline) {
            self::refuseBaseline();
        }
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
     * The shared rule, for each permission in GUARDED: a write may not take
     * it from its last holder, and the actor may not take it from
     * themselves. Those are the permissions that let somebody undo a write
     * through the site: members.manage for who holds what, roles.manage for
     * what each role grants.
     *
     * Every orphan refusal outranks every self-demotion, for the reason
     * assertMayDelete() gives, and members.manage is checked before
     * roles.manage, so a write that orphans both answers with the
     * members.manage code.
     *
     * @param  array<int, array<int, int>|null>  $memberRoles  member id => the roles they would hold, or null once deleted
     * @param  array<int, array<int, Permission>>  $rolePermissions  role id => what it would grant
     */
    private static function assertAdministrationSurvives(
        Member $actor,
        array $memberRoles = [],
        array $rolePermissions = [],
    ): void {
        $before = [];
        $after = [];

        foreach (self::GUARDED as $permission) {
            $before[$permission->value] = self::holders($permission);
            $after[$permission->value] = self::holders($permission, $memberRoles, $rolePermissions);

            // Only a write that takes the last holder away is refused. On a
            // database where nobody holds roles.manage, refusing would freeze
            // member administration as well, with no way out from the site.
            if ($before[$permission->value] !== [] && $after[$permission->value] === []) {
                self::refuseOrphan($permission);
            }
        }

        // A deleted actor is not demoted; assertMayDelete() has its own
        // refusal for that, and it must be the one the caller sees.
        $actorRemains = ! array_key_exists($actor->id, $memberRoles) || $memberRoles[$actor->id] !== null;

        foreach (self::GUARDED as $permission) {
            $heldBefore = in_array($actor->id, $before[$permission->value], true);

            if ($actorRemains && $heldBefore && ! in_array($actor->id, $after[$permission->value], true)) {
                throw new AccessIntegrityViolation(
                    'cannot_demote_self',
                    'A member cannot remove their own member or role administration',
                );
            }
        }
    }

    /**
     * One literal throw per code, rather than a code looked up from a map:
     * ApiErrorVocabularyTest finds the codes this class can raise by reading
     * `new AccessIntegrityViolation('…'` out of the source.
     */
    private static function refuseOrphan(Permission $permission): never
    {
        throw match ($permission) {
            Permission::RolesManage => new AccessIntegrityViolation(
                'cannot_remove_last_role_administrator',
                'This is the last member who can manage roles',
            ),
            default => new AccessIntegrityViolation(
                'cannot_remove_last_administrator',
                'This is the last member who can administer members',
            ),
        };
    }

    /**
     * The ids of the members who would hold a permission, once the given
     * changes are applied over what is stored. With no changes, who holds it
     * now.
     *
     * No credential filter: member credentials are NOT NULL, so every holder
     * can log in by construction. The schema is the guard; see
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
