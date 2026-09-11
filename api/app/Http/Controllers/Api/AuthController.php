<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Models\Member;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

#[Group('Session', weight: 10)]
class AuthController extends Controller
{
    /**
     * Five failures per username+IP, then a flat lock of DECAY_SECONDS measured
     * from the FIRST failure — it does not grow. RateLimiter::hit() calls
     * cache->add() for both the attempt counter and its `:timer`, which is a
     * no-op once either key already exists, so the TTL is set once, on the
     * first hit, and never extended by subsequent ones. Attempts made WHILE
     * throttled are not counted either: login() returns 429 before ever
     * calling hit(), so hammering a locked account does not push the lock out
     * further.
     *
     * Keyed on BOTH so that neither dimension alone defeats it: per-IP only
     * lets a botnet spread attempts across addresses, per-username only lets
     * one attacker lock a member out of their own account by hammering it.
     */
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 900;

    /**
     * Log in.
     *
     * Anonymous. Send `username` and `password`. A successful call answers
     * `{"ok": true}` and establishes the session cookie every authenticated
     * endpoint reads. It deliberately carries no identity of its own: call
     * `GET /api/v1/me` afterwards for who you are and what you may do.
     *
     * A username that does not exist and a wrong password both answer
     * `401 invalid_credentials`, the same code for each, so that neither can
     * be used to discover which accounts exist.
     *
     * After five failures for one username from one address, further attempts
     * answer `429 too_many_attempts` for fifteen minutes, counted from the
     * first failure. A correct password during the lockout is still refused,
     * and attempts made while locked out do not extend it.
     */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        $key = $this->throttleKey($credentials['username'], $request->ip());

        // Checked BEFORE the password is verified, so a throttled attacker who
        // finally guesses correctly is still refused. Verifying first and
        // throttling after would make the limit decorative.
        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            return ApiError::json(429, 'too_many_attempts', 'Too many attempts');
        }

        // One generic code, never per-field: saying which of username or
        // password was wrong enables enumeration. A member with no username
        // never reaches here — the `required` rule above rejects an empty
        // one, and a NULL username matches nothing.
        if (! Auth::attempt($credentials)) {
            RateLimiter::hit($key, self::DECAY_SECONDS);

            return ApiError::json(401, 'invalid_credentials', 'Incorrect username or password');
        }

        // THE CREDENTIALS WERE RIGHT, and everything below needs a session. A
        // request Sanctum did not treat as stateful has none, and calling
        // session() on it throws — which used to surface as a 500 carrying a
        // stack trace, to an anonymous caller, on the very first request any
        // integrator makes. Found by a black-box review on 2026-09-11; no test
        // caught it because the SPA and the test client are both stateful, so
        // the failing path is the one nothing internal exercises.
        //
        // Refused cleanly instead, and deliberately AFTER the attempt, so this
        // cannot be used to probe credentials without a session: a wrong
        // password still answers invalid_credentials either way.
        //
        // Not 419 invalid_session, which means "prime the cookie and retry" —
        // advice that would loop forever here, because the request will never
        // become stateful by retrying. Session auth needs a browser on a
        // configured origin; a server-to-server caller needs the token
        // credential that A6 adds.
        if (! $request->hasSession()) {
            return ApiError::json(400, 'stateful_request_required', 'This endpoint requires a session');
        }

        RateLimiter::clear($key);

        // Fixation defence: the pre-login session id must not survive the
        // privilege change.
        $request->session()->regenerate();

        // The absolute-lifetime clock. Written after regenerate(), because
        // regenerating migrates the session data and writing before it would
        // work but reads as though the order did not matter — it does the day
        // someone switches to a driver that does not migrate.
        // now()->timestamp, so the stamp and the check in
        // EnforceAbsoluteSessionLifetime read the same clock — the one a test
        // can move.
        $request->session()->put('auth.started_at', now()->timestamp);

        /** @var Member $member */
        $member = Auth::user();
        $member->forceFill(['last_login_at' => now()])->save();

        // Deliberately no role or permissions in this body. The client asks
        // GET /api/v1/me for identity, so there is exactly one shape describing
        // who you are and one place to change it.
        $body = ['ok' => true];

        return response()->json($body);
    }

    /**
     * Log out.
     *
     * Any logged-in member. Ends the current session, discards its cookie and
     * issues a fresh CSRF token, so the page that called this can go straight
     * on to log in again. Answers `{"ok": true}`.
     *
     * An anonymous caller answers `401 not_authenticated`.
     */
    public function logout(Request $request): JsonResponse
    {
        // Three steps, each doing a different half of the job. logout() forgets
        // the member on this request; invalidate() destroys the session data
        // and its id, so a copy of the cookie taken beforehand is worth nothing
        // afterwards; regenerateToken() replaces the CSRF token, because the
        // SPA stays on the same page and would otherwise send the dead one with
        // its next mutating request.
        //
        // The `web` guard by name, not the default: Sanctum's stateful SPA mode
        // authenticates these routes through the session, and that is the guard
        // holding the login.
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    /**
     * Read the current member and what they may do.
     *
     * Any logged-in member. Returns the caller's id, username, first and last
     * name, whether they play in a register (`isPlayer`, the single fact that
     * decides who is answerable for an event), whether they must change their
     * password before anything else (`mustChangePassword`), and `permissions`.
     *
     * `permissions` is the flat list of permission tokens the caller's roles
     * add up to, and it is what a client shows or hides a screen on. Roles are
     * not sent, because nothing in this API is authorised by role name.
     *
     * The response is never cacheable. An anonymous caller answers
     * `401 not_authenticated`.
     */
    public function me(Request $request): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        return response()->json([
            'id' => $member->id,
            'username' => $member->username,
            'firstName' => $member->first_name,
            'lastName' => $member->last_name,
            'isPlayer' => $member->isPlayer(),
            'mustChangePassword' => $member->must_change_password,
            'permissions' => $member->permissions()->map(fn ($p) => $p->value)->all(),
            // Redundant with the `no-store` middleware the whole authenticated
            // group carries, and kept: this body IS an identity, so it should
            // not depend on a route registration elsewhere to stay out of a
            // shared proxy.
        ])->header('Cache-Control', 'no-store, private');
    }

    /**
     * Normalises the username before keying, exactly as Laravel's own
     * LoginRequest::throttleKey() does: members.username collates
     * utf8mb4_unicode_ci (case-insensitive, PAD SPACE), so the database
     * authenticates spellings that a raw concatenation would count as
     * separate accounts — letting an attacker exhaust the limit as
     * "lea.keller" and then walk straight past it as "LEA.Keller".
     */
    private function throttleKey(string $username, ?string $ip): string
    {
        return 'login:'.Str::lower(trim($username)).'|'.($ip ?? 'unknown');
    }
}
