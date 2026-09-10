<?php

namespace App\Support;

use Illuminate\Support\Facades\Config;

/**
 * A signed "this form was rendered at" stamp, used to refuse submissions
 * that arrive impossibly fast.
 *
 * NO STORAGE. The timestamp travels inside the token and is authenticated by
 * an HMAC over it, so the server keeps nothing: no table, no cache entry, no
 * cleanup job. That matters on a shared host where the cache store is itself
 * a database table created by a migration.
 *
 * DELIBERATELY NOT SINGLE-USE. The Altcha replay guard this replaces
 * (App\Support\ChallengeGuard, since deleted) burned each challenge with
 * Cache::add(), which is right for proof-of-work and wrong here: a guest who
 * hits a validation error and resubmits would be rejected for reusing their
 * own token, and the form would have to re-fetch one on every failed attempt.
 * Replaying a valid token inside its own window is a marginal attack next to
 * that friction — the honeypot is the filter that catches naive bots, and
 * this is the one that catches instant submissions.
 *
 * Signed with APP_KEY, which every environment already has and no
 * environment shares.
 */
final class FormToken
{
    /**
     * A human cannot read a form and submit it this fast; a script can.
     *
     * Two seconds rather than something larger because this must never
     * refuse a real person — somebody returning to a tab they left open is
     * handled by the upper bound, not this one.
     */
    public const MIN_AGE_SECONDS = 2;

    /**
     * After this the stamp is stale. Generous, because a guest who opens the
     * form, goes to find their partner's dietary requirements and comes back
     * is doing nothing wrong.
     */
    public const MAX_AGE_SECONDS = 7200;

    /** Mint one for a form that is about to be rendered. */
    public static function issue(): string
    {
        $issuedAt = (string) time();

        return $issuedAt.'.'.self::sign($issuedAt);
    }

    /**
     * Is this token authentic, and was it issued inside the accepted window?
     *
     * Returns false for anything malformed rather than throwing: the caller
     * is a middleware whose whole job is to answer one refusal, and a
     * separate "malformed" answer would only tell an attacker which half
     * they got wrong.
     */
    public static function isValid(?string $token): bool
    {
        if ($token === null || ! str_contains($token, '.')) {
            return false;
        }

        [$issuedAt, $signature] = explode('.', $token, 2);

        if (! ctype_digit($issuedAt)) {
            return false;
        }

        // hash_equals, not ===: a timing-safe comparison, because this one
        // is compared against attacker-supplied input on a public endpoint.
        if (! hash_equals(self::sign($issuedAt), $signature)) {
            return false;
        }

        $age = time() - (int) $issuedAt;

        // A negative age means a clock skew or a forged future stamp; either
        // way it is not a form somebody just filled in.
        return $age >= self::MIN_AGE_SECONDS && $age <= self::MAX_AGE_SECONDS;
    }

    private static function sign(string $issuedAt): string
    {
        return hash_hmac('sha256', $issuedAt, (string) Config::get('app.key'));
    }
}
