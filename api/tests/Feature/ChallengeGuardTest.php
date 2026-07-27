<?php

namespace Tests\Feature;

use App\Support\ChallengeGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChallengeGuardTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_signature_can_be_consumed_once(): void
    {
        $guard = new ChallengeGuard;

        $this->assertTrue($guard->consume('sig-abc', 600));
    }

    public function test_replaying_the_same_signature_is_refused(): void
    {
        $guard = new ChallengeGuard;
        $guard->consume('sig-abc', 600);

        $this->assertFalse($guard->consume('sig-abc', 600));
    }

    public function test_distinct_signatures_do_not_collide(): void
    {
        $guard = new ChallengeGuard;

        $this->assertTrue($guard->consume('sig-abc', 600));
        $this->assertTrue($guard->consume('sig-def', 600));
    }

    public function test_a_non_positive_ttl_still_refuses_replay(): void
    {
        $guard = new ChallengeGuard;

        // An already-expired challenge must never be consumable at all.
        $this->assertFalse($guard->consume('sig-expired', 0));
    }
}
