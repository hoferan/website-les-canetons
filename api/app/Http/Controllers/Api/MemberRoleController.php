<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReplaceMemberRolesRequest;
use App\Http\Resources\MemberResource;
use App\Models\Member;
use App\Support\AccessIntegrity;
use App\Support\Audit;
use App\Support\SessionRevoker;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

#[Group('Members', weight: 50)]
class MemberRoleController extends Controller
{
    /**
     * Replace a member's roles.
     *
     * Requires `members.manage`. `roleIds` is the complete set the member is
     * left with, so send every role they should keep; an empty array removes
     * all of them. Read the roles that exist from `GET /api/v1/roles`.
     *
     * This is the only way any permission is granted or taken away. A role is
     * what groups permissions, and no endpoint in this API authorises by role
     * name, so nothing is ever granted to one member directly.
     *
     * The change ends every session the member has open, so a permission that
     * has just been removed stops working immediately rather than at their
     * next login. Answers the updated member and `sessionsEnded`.
     *
     * Refuses with `409 cannot_remove_last_administrator` when the new set
     * would leave nobody able to administer members, and
     * `409 cannot_demote_self` when callers would strip their own member
     * administration. Both are `409` rather than `403` because the caller does
     * hold the permission; the request conflicts with the state of the roster.
     * When both apply, the last-administrator refusal is the one returned. An
     * unknown role id answers `400 validation_failed` against `roleIds`.
     */
    public function __invoke(ReplaceMemberRolesRequest $request, Member $member): JsonResponse
    {
        // NO RE-AUTHENTICATION (decision B7, 2026-09-08). The cookie is trusted
        // here as it is everywhere else in this API.
        //
        // THE REMAINING ORDER IS STILL LOAD-BEARING: check the invariants
        // BEFORE the write, so a refusal leaves no trace; and write, then
        // revoke, then audit. Revoking before writing would end the sessions
        // and then fail, leaving the member logged out with their old
        // permissions intact.
        /** @var array<int, int> $roleIds */
        $roleIds = array_map('intval', $request->validated('roleIds'));

        AccessIntegrity::assertMayReplaceRoles($request->user(), $member, $roleIds);

        // Captured before the write, so the audit records who this was at the
        // time of the change.
        $label = $member->fullName();

        // Sessions are revoked in the SAME transaction as the change (§6). A
        // revoked permission that only takes effect at the next login is a
        // permission the holder can keep using all evening.
        //
        // The note sits out here rather than beside the revoke call, because
        // Scramble publishes the comment preceding a return as the response
        // description, and inside the closure it was being served as the
        // documentation for `sessionsEnded` on three separate endpoints.
        $sessionsEnded = DB::transaction(function () use ($member, $roleIds): int {
            $member->roles()->sync($roleIds);

            return SessionRevoker::forMember($member->id);
        });

        Audit::record($request->user(), 'member.roles_replaced', 'member', $member->id, $label);

        return response()->json([
            'member' => new MemberResource($member->load(['section', 'roles'])),
            'sessionsEnded' => $sessionsEnded,
        ]);
    }
}
