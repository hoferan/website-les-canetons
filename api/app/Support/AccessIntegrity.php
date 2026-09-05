<?php

namespace App\Support;

use App\Exceptions\AccessIntegrityViolation;
use App\Models\Member;
use Illuminate\Support\Facades\DB;

/**
 * The invariants that keep member administration recoverable.
 *
 * Two failure modes these exist to prevent, both of which end with someone
 * needing database access to repair a website:
 *
 *   1. The last holder of members.manage is deleted or demoted, and nobody can
 *      administer members any more.
 *   2. An administrator removes their own administration and cannot undo it.
 *
 * These are deliberately NOT permission checks — the caller has the permission.
 * They are state checks, which is why they raise 409 rather than 403.
 */
final class AccessIntegrity
{
    public static function assertMayDelete(Member $actor, Member $target): void
    {
        // Orphan check FIRST, deliberately. When the actor is deleting
        // themselves AND they are the last administrator, both conditions
        // are true — and "you'd lock everyone out" is the more informative
        // and more severe of the two, so it must win. Pinned by
        // test_the_violation_carries_the_last_administrator_code, which
        // exercises exactly that overlap.
        if (self::wouldOrphanAdministration([$target->id])) {
            throw new AccessIntegrityViolation(
                'cannot_remove_last_administrator',
                'This is the last member who can administer members',
            );
        }

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
        $keepsAdministration = self::rolesGrantAdministration($roleIds);

        // Same priority as assertMayDelete() above, and for the same reason:
        // orphaning administration outranks a self-demotion when both apply.
        if (! $keepsAdministration && self::wouldOrphanAdministration([$target->id])) {
            throw new AccessIntegrityViolation(
                'cannot_remove_last_administrator',
                'This is the last member who can administer members',
            );
        }

        if ($actor->id === $target->id && ! $keepsAdministration) {
            throw new AccessIntegrityViolation(
                'cannot_demote_self',
                'A member cannot remove their own member administration',
            );
        }
    }

    /**
     * True when removing these members would leave nobody holding
     * members.manage.
     *
     * This also returns true when nobody holds members.manage in the first
     * place — a state R1b's controller cannot reach (it is gated on
     * members.manage), but a seeder or console command calling into
     * AccessIntegrity against such a database would find every deletion
     * refused. Not a guarantee that removing these members is the cause.
     *
     * @param  array<int, int>  $excludedMemberIds
     */
    private static function wouldOrphanAdministration(array $excludedMemberIds): bool
    {
        $remaining = EffectivePermissions::memberIdsWith(Permission::MembersManage)
            ->reject(fn ($id) => in_array((int) $id, $excludedMemberIds, true));

        return $remaining->isEmpty();
    }

    /** @param  array<int, int>  $roleIds */
    private static function rolesGrantAdministration(array $roleIds): bool
    {
        if ($roleIds === []) {
            return false;
        }

        return DB::table('role_permissions')
            ->whereIn('role_id', $roleIds)
            ->where('permission', Permission::MembersManage->value)
            ->exists();
    }
}
