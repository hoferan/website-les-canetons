<?php

namespace App\Support;

use App\Exceptions\ReauthenticationFailed;
use App\Models\Member;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Re-proves that the person holding this session is the person who owns the
 * account, immediately before something irreversible.
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

        // Fails closed on a credential-less person row. Hash::check() against a
        // null hash raises a TypeError, and treating "no password set" as "any
        // password matches" would be very much worse. Such a row cannot be the
        // actor on a request today — there is no way to log in as it — but a
        // future caller must not be able to discover otherwise the hard way.
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
