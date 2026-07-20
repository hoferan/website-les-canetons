<?php

namespace App;

/**
 * Self-hosted, Altcha-wire-compatible proof-of-work challenge.
 *
 * challenge = sha256(salt . number); signature = HMAC-SHA256(challenge, secret).
 * The salt carries "?expires=<unixts>"; because the salt feeds the challenge
 * hash, a tampered expiry breaks the signature (no separate signing needed).
 * verifySolution is fail-closed and REQUIRES a signature by construction
 * (mitigating altcha-lib-php advisory GHSA-82w8-65qw-gch6).
 */
final class Altcha
{
    private const ALGORITHM = 'SHA-256';

    public function __construct(private string $secret)
    {
    }

    /**
     * @return array{algorithm:string,challenge:string,maxnumber:int,salt:string,signature:string}
     *
     * $now/$number/$saltHex are for deterministic tests only; production passes
     * just $maxNumber and $ttlSeconds.
     */
    public function createChallenge(
        int $maxNumber,
        int $ttlSeconds,
        ?int $now = null,
        ?int $number = null,
        ?string $saltHex = null
    ): array {
        $now ??= time();
        $number ??= random_int(0, $maxNumber);
        $saltHex ??= bin2hex(random_bytes(12));

        $salt = $saltHex . '?expires=' . ($now + $ttlSeconds);
        $challenge = hash('sha256', $salt . $number);
        $signature = hash_hmac('sha256', $challenge, $this->secret);

        return [
            'algorithm' => self::ALGORITHM,
            'challenge' => $challenge,
            'maxnumber' => $maxNumber,
            'salt'      => $salt,
            'signature' => $signature,
        ];
    }

    /** @return string|null the challenge signature (replay key) on success, else null. */
    public function verifySolution(string $payloadBase64, ?int $now = null): ?string
    {
        $now ??= time();

        $json = base64_decode($payloadBase64, true);
        if ($json === false) {
            return null;
        }
        $p = json_decode($json, true);
        if (!is_array($p)) {
            return null;
        }
        foreach (['algorithm', 'challenge', 'number', 'salt', 'signature'] as $key) {
            if (!isset($p[$key]) || !is_scalar($p[$key])) {
                return null; // a missing signature is a hard reject (advisory)
            }
        }
        if ((string) $p['algorithm'] !== self::ALGORITHM) {
            return null;
        }

        $expires = self::parseExpires((string) $p['salt']);
        if ($expires === null || $expires < $now) {
            return null;
        }

        $expectedChallenge = hash('sha256', (string) $p['salt'] . (string) $p['number']);
        if (!hash_equals($expectedChallenge, (string) $p['challenge'])) {
            return null;
        }

        $expectedSignature = hash_hmac('sha256', (string) $p['challenge'], $this->secret);
        if (!hash_equals($expectedSignature, (string) $p['signature'])) {
            return null;
        }

        return (string) $p['signature'];
    }

    private static function parseExpires(string $salt): ?int
    {
        $pos = strpos($salt, '?');
        if ($pos === false) {
            return null;
        }
        parse_str(substr($salt, $pos + 1), $params);

        return isset($params['expires']) && ctype_digit((string) $params['expires'])
            ? (int) $params['expires']
            : null;
    }
}
