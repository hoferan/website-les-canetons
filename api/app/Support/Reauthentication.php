<?php

namespace App\Support;

use App\Exceptions\ApiError;
use App\Exceptions\ReauthenticationFailed;
use App\Models\Member;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
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
    /**
     * The re-authentication password travels in a HEADER, never in the body and
     * never in the query string.
     *
     * WHY NOT THE QUERY STRING: Apache logs query strings in plain text, and
     * this project already learned that once — POST /api/migrate takes its
     * secret in X-Migrate-Token for exactly this reason. DELETE with a body put
     * it there anyway, because RFC 9110 §9.3.5 gives a DELETE body "no defined
     * semantics" and Scramble therefore maps DELETE parameters to query, which
     * the generated client faithfully turned into ?currentPassword=…
     *
     * WHY NOT A BODY ON THE OTHER TWO: one mechanism. A reader should not have
     * to remember which endpoint takes it which way, and the next destructive
     * endpoint should not have to choose.
     *
     * Precedent: AWS S3 carries MFA-on-delete in x-amz-mfa. The alternative
     * standard — step-up "sudo mode" marking the session re-authenticated for a
     * few minutes (GitHub, GitLab, Google) — was rejected by decision B1: it
     * needs session state, and a window in which a borrowed phone acts
     * unprompted is weaker than asking every time.
     */
    public const HEADER = 'X-Reauth-Password';

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

    /**
     * Reads the header and re-authenticates, reporting a missing one exactly as
     * the body version did.
     *
     * The field token stays `currentPassword` even though the transport is a
     * header: it names the FORM FIELD the user typed into, which is what
     * web/src/i18n/fr.ts looks up to say "Mot de passe actuel est requis". The
     * transport changed; the thing the user got wrong did not.
     *
     * @throws ReauthenticationFailed
     */
    public static function assertFromRequest(Request $request, Member $actor): void
    {
        $password = $request->header(self::HEADER);

        if (blank($password)) {
            throw new HttpResponseException(ApiError::json(
                400,
                'validation_failed',
                'Invalid form submission',
                [['field' => 'currentPassword', 'reason' => 'required']],
            ));
        }

        self::assert($actor, $password);
    }

    private static function throttleKey(Member $actor): string
    {
        return 'reauth:'.$actor->getKey();
    }
}
