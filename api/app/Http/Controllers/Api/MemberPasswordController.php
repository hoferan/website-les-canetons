<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Support\Audit;
use App\Support\GeneratedPassword;
use App\Support\SessionRevoker;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

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
     * `POST /api/v1/me/password`.
     *
     * A member resetting their own password this way keeps the session they
     * are calling from, and `sessionsEnded` then counts their other ones. The
     * ordinary route for that is `POST /api/v1/me/password`, which lets them
     * choose the password instead.
     */
    #[Response(200, 'The generated password, shown once. Every session of that member is revoked.')]
    #[Endpoint(operationId: 'memberPassword.reset')]
    public function __invoke(Request $request, Member $member): JsonResponse
    {
        // The committee issues every password (ADR 0016), and every member
        // already has one, so this is always a reset. A new account gets its
        // password from POST /api/v1/members, with the same generator and the
        // same forced change.
        //
        // makeDifferentFrom(), not make(): a reissue must not land on the
        // password already stored (#92). No null guard on the hash: the column
        // is non-nullable, and Larastan rejects the check as dead code.
        $password = GeneratedPassword::makeDifferentFrom(
            fn (string $candidate): bool => Hash::check($candidate, $member->password),
        );

        $sessionsEnded = DB::transaction(function () use ($request, $member, $password): int {
            // The 'hashed' cast on Member::casts() hashes this on save.
            $member->password = $password;
            // It was read out loud down a phone, so it is not a secret and must
            // not survive first use.
            $member->must_change_password = true;
            $member->save();

            // Resetting your own password here would otherwise log you out. The
            // UI sends administrators to /account instead, so this branch is
            // for the unusual path; the forced change applies either way.
            //
            // No test here tells the branches apart: under SESSION_DRIVER=array
            // the acting request owns no `sessions` row, so forMember() deletes
            // the same set. SessionRevocationTest covers forMemberExcept(). It
            // is kept so sessionsEnded means "other sessions".
            $ended = $request->user()->is($member)
                ? SessionRevoker::forMemberExcept($member->id, $request->session()->getId())
                : SessionRevoker::forMember($member->id);

            return $ended;
        });

        // No password in the audit log, pinned by
        // MemberPasswordTest::test_the_generated_password_never_appears_in_the_audit_log.
        Audit::record($request->user(), 'member.password_reset', 'member', $member->id, $member->fullName());

        return response()->json([
            'generatedPassword' => $password,
            'sessionsEnded' => $sessionsEnded,
        ]);
    }
}
