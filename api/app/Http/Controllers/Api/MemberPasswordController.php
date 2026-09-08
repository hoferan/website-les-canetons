<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Support\Audit;
use App\Support\GeneratedPassword;
use App\Support\Reauthentication;
use App\Support\SessionRevoker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MemberPasswordController extends Controller
{
    /**
     * Issues a member a new password, shown to the administrator exactly once.
     *
     * §4.4 describes ONE mechanism for a password coming into being — open a
     * member, hit "Réinitialiser le mot de passe", read out what appears — so
     * there is one endpoint for it. Since 2026_09_08_000001 every member
     * already has a password, so this is always a reset; the "give this person
     * an account" case is POST /api/members, which mints one at creation using
     * the same generator and the same forced-change semantics.
     *
     * The returned password is the only copy that will ever exist in plaintext:
     * it is hashed on the way into the database, never written to the audit
     * log, and never returned again.
     */
    public function __invoke(Request $request, Member $member): JsonResponse
    {
        $request->validate(['currentPassword' => ['required', 'string']]);

        Reauthentication::assert($request->user(), $request->string('currentPassword')->value());

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
            return $request->user()->is($member)
                ? SessionRevoker::forMemberExcept($member->id, $request->session()->getId())
                : SessionRevoker::forMember($member->id);
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
