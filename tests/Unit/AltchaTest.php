<?php

use App\Altcha;
use PHPUnit\Framework\TestCase;

final class AltchaTest extends TestCase
{
    private const SECRET = 'unit-test-secret';

    /** Build the base64 solution payload a browser would send for a challenge. */
    private static function solve(array $challenge, int $number): string
    {
        return base64_encode((string) json_encode([
            'algorithm' => $challenge['algorithm'],
            'challenge' => $challenge['challenge'],
            'number'    => $number,
            'salt'      => $challenge['salt'],
            'signature' => $challenge['signature'],
        ]));
    }

    public function testSolvedPayloadVerifiesAndReturnsSignature(): void
    {
        $a = new Altcha(self::SECRET);
        $ch = $a->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        $sig = $a->verifySolution(self::solve($ch, 42), now: 1_000_000);

        $this->assertSame($ch['signature'], $sig);
    }

    public function testWrongNumberFails(): void
    {
        $a = new Altcha(self::SECRET);
        $ch = $a->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        $this->assertNull($a->verifySolution(self::solve($ch, 43), now: 1_000_000));
    }

    public function testMissingSignatureFails(): void
    {
        $a = new Altcha(self::SECRET);
        $ch = $a->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        $payload = base64_encode((string) json_encode([
            'algorithm' => $ch['algorithm'],
            'challenge' => $ch['challenge'],
            'number'    => 42,
            'salt'      => $ch['salt'],
            // signature intentionally omitted (advisory)
        ]));
        $this->assertNull($a->verifySolution($payload, now: 1_000_000));
    }

    public function testExpiredChallengeFails(): void
    {
        $a = new Altcha(self::SECRET);
        $ch = $a->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        // 601s later — past the 600s ttl.
        $this->assertNull($a->verifySolution(self::solve($ch, 42), now: 1_000_601));
    }

    public function testWrongSecretFails(): void
    {
        $issuer = new Altcha(self::SECRET);
        $ch = $issuer->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        $attacker = new Altcha('different-secret');
        $this->assertNull($attacker->verifySolution(self::solve($ch, 42), now: 1_000_000));
    }

    public function testMalformedPayloadFails(): void
    {
        $a = new Altcha(self::SECRET);
        $this->assertNull($a->verifySolution('not base64 %%%', now: 1_000_000));
        $this->assertNull($a->verifySolution(base64_encode('not json'), now: 1_000_000));
    }
}
