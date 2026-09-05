<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

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

        if (! Auth::attempt($credentials)) {
            RateLimiter::hit($key, self::DECAY_SECONDS);

            // One generic code, never per-field: saying which of username or
            // password was wrong enables enumeration. A member with no username
            // never reaches here — the `required` rule above rejects an empty
            // one, and a NULL username matches nothing.
            return ApiError::json(401, 'invalid_credentials', 'Incorrect username or password');
        }

        RateLimiter::clear($key);

        // Fixation defence: the pre-login session id must not survive the
        // privilege change.
        $request->session()->regenerate();

        // The absolute-lifetime clock. Written after regenerate(), because
        // regenerating migrates the session data and writing before it would
        // work but reads as though the order did not matter — it does the day
        // someone switches to a driver that does not migrate.
        $request->session()->put('auth.started_at', time());

        /** @var Member $member */
        $member = Auth::user();
        $member->forceFill(['last_login_at' => now()])->save();

        // Deliberately no role or permissions in this body. The client asks
        // GET /api/me for identity, so there is exactly one shape describing
        // who you are and one place to change it.
        return response()->json(['ok' => true]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

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
