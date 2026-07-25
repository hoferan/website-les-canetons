<?php

namespace Tests\Unit;

use App\Support\Altcha;
use PHPUnit\Framework\TestCase;

class AltchaTest extends TestCase
{
    private const SECRET = 'test-secret';

    /** Solve a challenge the way the browser widget does. */
    private function solve(array $challenge, int $number): string
    {
        return base64_encode(json_encode([
            'algorithm' => $challenge['algorithm'],
            'challenge' => $challenge['challenge'],
            'number' => $number,
            'salt' => $challenge['salt'],
            'signature' => $challenge['signature'],
        ]));
    }

    public function test_a_correct_solution_returns_the_signature(): void
    {
        $altcha = new Altcha(self::SECRET);
        $challenge = $altcha->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');

        $this->assertSame(
            $challenge['signature'],
            $altcha->verifySolution($this->solve($challenge, 42), 1_000_000)
        );
    }

    public function test_a_wrong_number_is_rejected(): void
    {
        $altcha = new Altcha(self::SECRET);
        $challenge = $altcha->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');

        $this->assertNull($altcha->verifySolution($this->solve($challenge, 43), 1_000_000));
    }

    public function test_an_expired_challenge_is_rejected(): void
    {
        $altcha = new Altcha(self::SECRET);
        $challenge = $altcha->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');

        // 601s later: past the 600s TTL.
        $this->assertNull($altcha->verifySolution($this->solve($challenge, 42), 1_000_601));
    }

    public function test_a_missing_signature_is_rejected(): void
    {
        $altcha = new Altcha(self::SECRET);
        $challenge = $altcha->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');
        $payload = json_decode(base64_decode($this->solve($challenge, 42)), true);
        unset($payload['signature']);

        $this->assertNull(
            $altcha->verifySolution(base64_encode(json_encode($payload)), 1_000_000)
        );
    }

    public function test_a_signature_from_another_secret_is_rejected(): void
    {
        $challenge = (new Altcha('other-secret'))
            ->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');

        $this->assertNull(
            (new Altcha(self::SECRET))->verifySolution($this->solve($challenge, 42), 1_000_000)
        );
    }

    public function test_garbage_input_is_rejected(): void
    {
        $altcha = new Altcha(self::SECRET);

        $this->assertNull($altcha->verifySolution('not-base64!!', 1_000_000));
        $this->assertNull($altcha->verifySolution(base64_encode('not json'), 1_000_000));
    }
}
