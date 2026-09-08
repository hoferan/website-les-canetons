<?php

namespace App\Support;

use App\Exceptions\ReauthenticationFailed;
use App\Models\Member;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Verifies that the caller knows their own current password.
 *
 * SCOPE, since decision B7 (2026-09-08): this is used by ONE caller,
 * AccountPasswordController. The destructive roster endpoints no longer
 * re-authenticate — the session cookie is trusted there, as it already was for
 * reading the whole roster and editing anyone.
 *
 * What remains is not ceremony: knowing the current password is the input a
 * password change needs. Without it a borrowed, unlocked phone changes the
 * password in two taps and locks the real owner out of their own account
 * permanently, needing an administrator to rescue them. Every site asks for
 * this, and for that reason.
 *
 * WHY IT IS THROTTLED. Without a limit this is a password oracle: anyone with
 * a stolen session cookie can guess the account's real password against
 * something that answers yes or no, as fast as the host will serve it. The
 * request is already authenticated, so none of the login defences apply.
 *
 * KEYED ON THE ACTOR, not the IP. Per-IP would let a botnet spread attempts
 * across addresses, and would also let one colleague's typos lock everybody
 * else out of administering the band. The actor is the thing being protected,
 * so the actor is the thing that is counted.
 *
 * Attempts made WHILE throttled do not extend the lock: assert() returns
 * before hit() once tooManyAttempts() is true, exactly as
 * AuthController::login() does. Hammering a locked account must not push the
 * lock further out.
 */
final class Reauthentication
{
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 900;

    /** @throws ReauthenticationFailed */
    public static function assert(Member $actor, ?string $password): void
    {
        $key = self::throttleKey($actor);

        // Checked BEFORE the hash comparison, so a throttled actor is refused
        // even when they finally type it correctly. Verifying first and
        // throttling after would make the limit decorative.
        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            throw new ReauthenticationFailed(429, 'too_many_attempts', 'Too many attempts');
        }

        // Fails closed, explicitly.
        //
        // MEASURED 2026-09-08, correcting a claim this code used to carry: the
        // plan said Hash::check() against a null hash raises a TypeError. It
        // does not — Laravel's AbstractHasher::check() returns false for a null
        // or empty hash, so the comparison below would already refuse. Removing
        // this branch changes no observable behaviour, and no test can
        // distinguish the two, which is why there is no mutation test for it.
        //
        // Kept anyway, as intent rather than as load-bearing logic: this is the
        // path that authorises destroying a member, and "no password set must
        // never mean any password matches" is worth saying in code rather than
        // inheriting from a framework method's edge case. A reader who prefers
        // to lean on the framework can delete it knowing exactly what it does.
        //
        // Since 2026_09_08_000001 a persisted member always has a password, so
        // this is reachable only through an unsaved or partially-hydrated
        // model — which is precisely what ReauthenticationTest constructs.
        // Larastan types Member::$password as string because the column is NOT
        // NULL, and for a PERSISTED member it is right. This branch exists for
        // an unsaved or partially-hydrated model, which ReauthenticationTest
        // constructs deliberately. Static analysis cannot see that; the test can.
        // @phpstan-ignore identical.alwaysFalse (an unsaved model can still be null)
        if ($password === null || $password === '' || $actor->password === null) {
            RateLimiter::hit($key, self::DECAY_SECONDS);

            throw new ReauthenticationFailed(403, 'reauth_failed', 'Password confirmation failed');
        }

        if (! Hash::check($password, $actor->password)) {
            RateLimiter::hit($key, self::DECAY_SECONDS);

            throw new ReauthenticationFailed(403, 'reauth_failed', 'Password confirmation failed');
        }

        RateLimiter::clear($key);
    }

    private static function throttleKey(Member $actor): string
    {
        return 'reauth:'.$actor->getKey();
    }
}
