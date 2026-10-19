<?php

namespace App\Support;

use App\Exceptions\ReauthenticationFailed;
use App\Models\Member;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Verifies that the caller knows their own current password.
 *
 * It has one caller, AccountPasswordController. The destructive roster
 * endpoints trust the session cookie instead (ADR 0017).
 *
 * Knowing the current password is the input a password change needs. Without
 * it a borrowed, unlocked phone changes the password in two taps and locks the
 * real owner out of their account until an administrator rescues them.
 *
 * Throttled, because otherwise this is a password oracle: anyone with a stolen
 * session cookie could guess the account's password against something that
 * answers yes or no, as fast as the host serves it. The request is already
 * authenticated, so none of the login defences apply.
 *
 * Keyed on the actor, not the IP. Per-IP would let a botnet spread attempts
 * across addresses, and let one colleague's typos lock everybody else out.
 * The actor is what is protected, so the actor is what is counted.
 *
 * Attempts made while throttled do not extend the lock: assert() returns
 * before hit() once tooManyAttempts() is true, as AuthController::login()
 * does.
 */
final class Reauthentication
{
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 900;

    /** @throws ReauthenticationFailed */
    public static function assert(Member $actor, ?string $password): void
    {
        $key = self::throttleKey($actor);

        // Checked before the hash comparison, so a throttled actor is refused
        // even with the right password. Verifying first would make the limit
        // decorative.
        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            throw new ReauthenticationFailed(429, 'too_many_attempts', 'Too many attempts');
        }

        // Fails closed, explicitly. Laravel's AbstractHasher::check() already
        // returns false for a null or empty hash, so this branch changes no
        // observable behaviour and has no mutation test. It states the intent
        // on the path that authorises a password change: no password set must
        // never mean any password matches.
        //
        // A persisted member always has a password (the column is NOT NULL,
        // which is why Larastan types Member::$password as string). This is
        // reachable only through an unsaved or partially hydrated model, which
        // ReauthenticationTest constructs deliberately.
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
