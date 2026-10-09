<?php

namespace App\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
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
    /** The request attribute ofRequest() memoizes into. */
    private const REQUEST_KEY = 'permissions';

    /**
     * The caller's permission set, resolved ONCE per request.
     *
     * for() is a single query returning EVERY permission the member holds,
     * but Member::hasPermission() re-runs it on every call, so a request that
     * asks two questions would pay twice. Memoizing a boolean PER GATE (the
     * shape the planning's gates used to take) still costs one query per gate,
     * because each gate's first check throws the rest of the set away.
     * Memoizing the SET, once, keeps the total at one query however many
     * askers there are: the route's `permission:` middleware, the draft
     * filter, and the planning's per-row gates all read this. That is what
     * the query budgets in EventIndexTest, EventCountsTest and ChaseListTest
     * actually pin.
     *
     * A request with no user resolves to an empty set: EntityTag::state()
     * renders EventResource through a bare Request::create('/'), and every
     * gate must answer false there rather than throw.
     *
     * Only for the CALLER, never for a member a request acts on, and only
     * read before anything in the request changes the caller's roles.
     *
     * @return Collection<int, Permission>
     */
    public static function ofRequest(Request $request): Collection
    {
        if (! $request->attributes->has(self::REQUEST_KEY)) {
            $request->attributes->set(
                self::REQUEST_KEY,
                $request->user()?->permissions() ?? collect(),
            );
        }

        return $request->attributes->get(self::REQUEST_KEY);
    }

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
        return self::holders($permission)->distinct()->pluck('member_roles.member_id');
    }

    /**
     * The same ids as memberIdsWith(), as a subquery for `whereIn()`.
     *
     * For the queries that filter members by a permission, such as who is
     * expected to answer an event. Inlined into the caller's own query, so a
     * filter costs no extra round trip, and the chase list and the planning's
     * counts keep the fixed query budgets their tests pin.
     */
    public static function holders(Permission $permission): Builder
    {
        return DB::table('member_roles')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'member_roles.role_id')
            ->where('role_permissions.permission', $permission->value)
            ->select('member_roles.member_id');
    }

    /** @return Collection<int, int> the ids of roles granting a permission */
    public static function roleIdsGranting(Permission $permission): Collection
    {
        return DB::table('role_permissions')
            ->where('permission', $permission->value)
            ->pluck('role_id')
            ->map(fn ($id): int => (int) $id);
    }
}
