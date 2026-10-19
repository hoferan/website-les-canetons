<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\AccountPasswordRequest;
use App\Support\Audit;
use App\Support\Emits;
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
     * Requires `account.manage`, which every account holds through the
     * baseline role, and acts on the caller's own account only. It is where a
     * member sent by `mustChangePassword` lands.
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
     * `400 validation_failed` with `too_short` against `newPassword`. A
     * `newPassword` equal to the current one answers `409 password_unchanged`
     * and changes nothing, the forced-change flag included.
     */
    // An invokable controller gives Scramble no method name, so the explicit
    // operationId keeps the `resource.action` shape orval turns into a hook
    // name.
    #[Response(200, 'Changed. `sessionsEnded` counts the caller other sessions that were revoked.')]
    #[Endpoint(operationId: 'account.password')]
    #[Emits('reauth_failed', 'too_many_attempts', 'password_unchanged')]
    public function __invoke(AccountPasswordRequest $request): JsonResponse
    {
        // Gated on account.manage, which the baseline role grants to every
        // account. Every first login lands here, because a committee-issued
        // password arrives with must_change_password set.
        //
        // Knowing the current password is what stands between a borrowed,
        // unlocked phone and a stolen account. Reauthentication applies its
        // per-actor throttle; this is its only caller (ADR 0017).
        $member = $request->user();

        $current = $request->string('currentPassword')->value();

        Reauthentication::assert($member, $current);

        // #92. A string comparison is exact here: assert() has just proved
        // $current is the stored password, so a second Hash::check would
        // answer the same question at the cost of an argon2id verification.
        //
        // Checked after the re-authentication, so `password_unchanged` never
        // tells somebody who does not know the password anything about their
        // guess.
        //
        // The refusal matters most under must_change_password: a dictated
        // committee password has been heard by somebody else, and "changing"
        // it to itself would clear the flag while leaving it live.
        if ($request->string('newPassword')->value() === $current) {
            return ApiError::json(409, 'password_unchanged', 'The new password is the current one');
        }

        $sessionsEnded = DB::transaction(function () use ($request, $member): int {
            $member->password = $request->string('newPassword')->value();
            $member->must_change_password = false;
            $member->save();

            // A privilege change, so the session id must not survive it (the
            // same fixation defence login performs).
            $request->session()->regenerate();

            // After regenerate(): reading the id beforehand would keep the row
            // regenerate() has just destroyed and delete the live one. See
            // SessionRevoker.
            //
            // No test here tells this from forMember(): the new id has no row
            // yet, and the session is persisted at the end of the request. It
            // is kept so sessionsEnded means "other sessions", as the UI
            // reports it.
            $ended = SessionRevoker::forMemberExcept($member->id, $request->session()->getId());

            return $ended;
        });

        Audit::record($member, 'account.password_changed', 'member', $member->id, $member->fullName());

        return response()->json(['ok' => true, 'sessionsEnded' => $sessionsEnded]);
    }
}
