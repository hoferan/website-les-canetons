<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AccountPasswordRequest;
use App\Support\Audit;
use App\Support\Reauthentication;
use App\Support\SessionRevoker;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AccountPasswordController extends Controller
{
    /**
     * A member changes their own password.
     *
     * Gated on authentication alone — no permission. This is the one screen
     * every account holder needs and nobody administers, and it is where every
     * first login lands, because a committee-issued password arrives with
     * must_change_password set.
     *
     * Re-authentication here is not ceremony bolted on: knowing the current
     * password is the only thing standing between a borrowed, unlocked phone
     * and a permanently stolen account. It reuses Reauthentication, so the same
     * per-actor throttle applies.
     */
    public function __invoke(AccountPasswordRequest $request): JsonResponse
    {
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
            return SessionRevoker::forMemberExcept($member->id, $request->session()->getId());
        });

        Audit::record($member, 'account.password_changed', 'member', $member->id, $member->fullName());

        return response()->json(['ok' => true, 'sessionsEnded' => $sessionsEnded]);
    }
}
