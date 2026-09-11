<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AccountPasswordRequest;
use App\Support\Audit;
use App\Support\Reauthentication;
use App\Support\SessionRevoker;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

#[Group('Session', weight: 10)]
class AccountPasswordController extends Controller
{
    /**
     * Change your own password.
     *
     * Any logged-in account holder, for their own account. No permission is
     * needed: this is the screen every member has and nobody administers, and
     * it is where a member sent by `mustChangePassword` lands.
     *
     * Send `currentPassword` and `newPassword`. The new one must be at least
     * eight characters.
     *
     * On success the password is replaced, the forced-change flag is cleared,
     * and every other session the member has open is ended. Answers
     * `{"ok": true, "sessionsEnded": n}`, where `sessionsEnded` counts those
     * other sessions; the calling session stays valid.
     *
     * A wrong `currentPassword` answers `403 reauth_failed`. After five wrong
     * ones the account answers `429 too_many_attempts` for fifteen minutes,
     * and a correct password during that window is still refused. A
     * `newPassword` shorter than eight characters answers
     * `400 validation_failed` with `too_short` against `newPassword`.
     */
    // An invokable controller has no method name for Scramble to build an
    // operationId from, so it falls back to the class name and the operation
    // loses the `resource.action` shape every other one here has. That shape is
    // what orval turns into a hook name, so it is the client's vocabulary
    // rather than a documentation detail.
    #[Response(200, 'Changed. `sessionsEnded` counts the caller other sessions that were revoked.')]
    #[Endpoint(operationId: 'account.password')]
    public function __invoke(AccountPasswordRequest $request): JsonResponse
    {
        // GATED ON AUTHENTICATION ALONE — no permission. This is the one screen
        // every account holder needs and nobody administers, and it is where
        // every first login lands, because a committee-issued password arrives
        // with must_change_password set.
        //
        // Re-authentication here is not ceremony bolted on: knowing the current
        // password is the only thing standing between a borrowed, unlocked
        // phone and a permanently stolen account. It reuses Reauthentication,
        // so the same per-actor throttle applies.
        //
        // Since decision B7 (2026-09-08) this is Reauthentication's ONLY
        // caller: the destructive roster endpoints no longer re-authenticate.
        $member = $request->user();

        Reauthentication::assert($member, $request->string('currentPassword')->value());

        $sessionsEnded = DB::transaction(function () use ($request, $member): int {
            $member->password = $request->string('newPassword')->value();
            $member->must_change_password = false;
            $member->save();

            // A privilege change, so the session id must not survive it — the
            // same fixation defence login performs.
            $request->session()->regenerate();

            // AFTER regenerate(), deliberately: the id changes, and reading it
            // beforehand would keep the row regenerate() has just destroyed
            // while deleting the live one. See SessionRevoker.
            //
            // Measured 2026-09-08: no test here distinguishes this from
            // forMember(). regenerate() runs first, so the new id has no row
            // yet and both calls remove the same three; the actor stays logged
            // in either way because the session is persisted at the end of the
            // request. Kept as the correct call — sessionsEnded then means
            // "other sessions", which is what the UI reports.
            $ended = SessionRevoker::forMemberExcept($member->id, $request->session()->getId());

            return $ended;
        });

        Audit::record($member, 'account.password_changed', 'member', $member->id, $member->fullName());

        return response()->json(['ok' => true, 'sessionsEnded' => $sessionsEnded]);
    }
}
