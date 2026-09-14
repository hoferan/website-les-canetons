<?php

namespace App\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * A member's effective permissions: the union over their roles.
 *
 * One query with a join, rather than loading roles and their permissions as
 * relations — this runs on every permission-gated request and an N+1 here would
 * be paid on a shared host.
 *
 * Unknown stored values are DROPPED, not thrown on. A permission removed from
 * the enum leaves rows behind, and a Permission::from() would turn that into a
 * 500 for every member who still carried one.
 */
final class EffectivePermissions
{
    /** @return Collection<int, Permission> */
    public static function for(int $memberId): Collection
    {
        return DB::table('member_roles')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'member_roles.role_id')
            ->where('member_roles.member_id', $memberId)
            ->distinct()
            ->pluck('role_permissions.permission')
            ->map(fn (string $value): ?Permission => Permission::tryFrom($value))
            ->filter()
            ->values();
    }

    /** @return Collection<int, int> the ids of members holding a permission */
    public static function memberIdsWith(Permission $permission): Collection
    {
        return DB::table('member_roles')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'member_roles.role_id')
            ->where('role_permissions.permission', $permission->value)
            ->distinct()
            ->pluck('member_roles.member_id');
    }
}
