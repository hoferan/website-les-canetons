<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Support\Audit;
use App\Support\GeneratedPassword;
use App\Support\SessionRevoker;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

#[Group('Members', weight: 50)]
class MemberPasswordController extends Controller
{
    /**
     * Reset a member's password.
     *
     * Requires `members.manage`. Mints a readable password an administrator
     * can dictate over the phone, replaces the member's own with it, and ends
     * every session that member has open. Takes no body. Answers
     * `{"generatedPassword": "...", "sessionsEnded": n}`.
     *
     * `generatedPassword` is shown in this response and nowhere else: it is
     * hashed on the way into the database, is never written to the audit log,
     * and no later call returns it. A lost one is replaced by calling this
     * again. The member is required to change it at their next login, through
     * `POST /api/me/password`.
     *
     * A member resetting their own password this way keeps the session they
     * are calling from, and `sessionsEnded` then counts their other ones. The
     * ordinary route for that is `POST /api/me/password`, which lets them
     * choose the password instead.
     */
    public function __invoke(Request $request, Member $member): JsonResponse
    {
        // §4.4 describes ONE mechanism for a password coming into being — open
        // a member, hit "Réinitialiser le mot de passe", read out what appears
        // — so there is one endpoint for it. Since 2026_09_08_000001 every
        // member already has a password, so this is always a reset; the "give
        // this person an account" case is POST /api/members, which mints one at
        // creation using the same generator and the same forced-change
        // semantics.
        $password = GeneratedPassword::make();

        $sessionsEnded = DB::transaction(function () use ($request, $member, $password): int {
            // The 'hashed' cast on Member::casts() hashes this on save.
            $member->password = $password;
            // It was read out loud down a phone, so it is not a secret and must
            // not survive first use.
            $member->must_change_password = true;
            $member->save();

            // Resetting your OWN password here would otherwise log you out with
            // a generated password you then have to use. The UI sends
            // administrators to /account instead, so this branch is for the
            // unusual path only — the forced change above still applies either
            // way.
            //
            // NOT DISTINGUISHED BY ANY TEST HERE, measured 2026-09-08: under
            // SESSION_DRIVER=array the acting request owns no `sessions` row,
            // so forMember() would delete the same set. SessionRevocationTest
            // covers what forMemberExcept() itself does. Kept because it is the
            // correct call and makes sessionsEnded mean "other sessions".
            $ended = $request->user()->is($member)
                ? SessionRevoker::forMemberExcept($member->id, $request->session()->getId())
                : SessionRevoker::forMember($member->id);

            return $ended;
        });

        // No password in the audit log, ever — pinned by
        // MemberPasswordTest::test_the_generated_password_never_appears_in_the_audit_log.
        Audit::record($request->user(), 'member.password_reset', 'member', $member->id, $member->fullName());

        return response()->json([
            'generatedPassword' => $password,
            'sessionsEnded' => $sessionsEnded,
        ]);
    }
}
