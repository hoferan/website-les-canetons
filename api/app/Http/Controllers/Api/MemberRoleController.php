<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReplaceMemberRolesRequest;
use App\Http\Resources\MemberResource;
use App\Models\Member;
use App\Support\AccessIntegrity;
use App\Support\Audit;
use App\Support\SessionRevoker;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class MemberRoleController extends Controller
{
    /**
     * Replaces one member's roles — which is the only way any permission is
     * ever granted or taken away (design §3: no direct per-member grants).
     *
     * NO RE-AUTHENTICATION (decision B7, 2026-09-08). The cookie is trusted
     * here as it is everywhere else in this API.
     *
     * THE REMAINING ORDER IS STILL LOAD-BEARING: check the invariants BEFORE
     * the write, so a refusal leaves no trace; and write, then revoke, then
     * audit. Revoking before writing would end the sessions and then fail,
     * leaving the member logged out with their old permissions intact.
     */
    public function __invoke(ReplaceMemberRolesRequest $request, Member $member): JsonResponse
    {
        /** @var array<int, int> $roleIds */
        $roleIds = array_map('intval', $request->validated('roleIds'));

        AccessIntegrity::assertMayReplaceRoles($request->user(), $member, $roleIds);

        // Captured before the write, so the audit records who this was at the
        // time of the change.
        $label = $member->fullName();

        $sessionsEnded = DB::transaction(function () use ($member, $roleIds): int {
            $member->roles()->sync($roleIds);

            // In the SAME transaction as the change (§6). A revoked permission
            // that only takes effect at the next login is a permission the
            // holder can keep using all evening.
            return SessionRevoker::forMember($member->id);
        });

        Audit::record($request->user(), 'member.roles_replaced', 'member', $member->id, $label);

        return response()->json([
            'member' => new MemberResource($member->load(['section', 'roles'])),
            'sessionsEnded' => $sessionsEnded,
        ]);
    }
}
