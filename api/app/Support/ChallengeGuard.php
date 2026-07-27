<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Single-use store for solved Altcha challenge signatures (replay protection).
 *
 * Replaces the old app's `used_challenges` table: Cache::add() is atomic —
 * it writes only if the key is absent and reports which happened — which is
 * exactly the semantics needed, and entries expire on their own so no prune
 * step is required.
 *
 * Requires a SHARED, durable cache store (the database store; see the
 * server .env). With the `array` store each request gets a fresh cache and
 * every replay would succeed. `artisan cache:clear` drops outstanding guards,
 * permitting one replay inside a challenge's remaining TTL by an attacker
 * holding the exact payload — accepted, and noted in the spec.
 */
final class ChallengeGuard
{
    private const PREFIX = 'altcha:used:';

    /**
     * @param  string  $signature  the challenge signature returned by Altcha::verifySolution
     * @param  int  $ttlSeconds  how long the guard must outlive the challenge
     * @return bool true if newly consumed; false on replay or an expired challenge
     */
    public function consume(string $signature, int $ttlSeconds): bool
    {
        if ($ttlSeconds <= 0) {
            return false;
        }

        return Cache::add(self::PREFIX.hash('sha256', $signature), true, $ttlSeconds);
    }
}
