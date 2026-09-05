<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    /**
     * Five failures per username+IP, then a one-minute lock that grows with
     * every further attempt.
     *
     * Keyed on BOTH so that neither dimension alone defeats it: per-IP only
     * lets a botnet spread attempts across addresses, per-username only lets
     * one attacker lock a member out of their own account by hammering it.
     */
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 60;

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

    private function throttleKey(string $username, ?string $ip): string
    {
        return 'login:'.$username.'|'.($ip ?? 'unknown');
    }
}
