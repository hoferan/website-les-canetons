<?php

namespace Tests\Feature;

use App\Exceptions\ReauthenticationFailed;
use App\Models\Member;
use App\Support\Reauthentication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Re-proving who you are, immediately before something irreversible (spec §6,
 * decision B1).
 *
 * The threat this defends against is not an outsider — it is an authenticated
 * one. Without a limit, an attacker holding a stolen session cookie has a
 * password oracle: a clean yes/no answer about the account's real password,
 * guessable as fast as the host will serve it.
 */
class ReauthenticationTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $username = 'admin', ?string $password = 'correct-horse'): Member
    {
        return Member::create([
            'first_name' => 'Alex',
            'last_name' => 'Actor',
            'username' => $username,
            'password' => $password,
        ]);
    }

    public function test_the_correct_password_passes(): void
    {
        Reauthentication::assert($this->actor(), 'correct-horse');

        $this->expectNotToPerformAssertions();
    }

    public function test_a_wrong_password_is_refused_as_403(): void
    {
        try {
            Reauthentication::assert($this->actor(), 'wrong');
            $this->fail('Expected ReauthenticationFailed');
        } catch (ReauthenticationFailed $e) {
            // 403, not 401: the session is perfectly valid and the caller holds
            // the permission. What failed is the re-proof, not the login.
            $this->assertSame(403, $e->status);
            $this->assertSame('reauth_failed', $e->errorCode);
        }
    }

    public function test_a_credential_less_member_cannot_reauthenticate(): void
    {
        // FAILING CLOSED. 2026_09_08_000001 made both credentials NOT NULL, so a
        // PERSISTED member always has a password; this constructs an unsaved
        // model to reach the branch at all.
        //
        // What this pins is the OUTCOME, not the mechanism. Laravel's hasher
        // already returns false for a null hash, so the explicit guard in
        // Reauthentication and its absence are indistinguishable from here —
        // measured 2026-09-08. The assertion is still worth having: it says
        // that whatever the mechanism, a member with no password never
        // re-authenticates.
        $actor = new Member(['first_name' => 'Ghost', 'last_name' => 'Actor']);
        $actor->id = 9999;

        $this->expectException(ReauthenticationFailed::class);

        Reauthentication::assert($actor, 'anything');
    }

    public function test_repeated_wrong_passwords_lock_the_actor_out_with_429(): void
    {
        $actor = $this->actor();

        for ($i = 0; $i < 5; $i++) {
            try {
                Reauthentication::assert($actor, 'wrong');
            } catch (ReauthenticationFailed) {
                // expected
            }
        }

        try {
            // Note the CORRECT password: a throttled actor is refused anyway,
            // or the limit is decorative — the same argument as the login
            // throttle in AuthController.
            Reauthentication::assert($actor, 'correct-horse');
            $this->fail('Expected ReauthenticationFailed');
        } catch (ReauthenticationFailed $e) {
            $this->assertSame(429, $e->status);
            $this->assertSame('too_many_attempts', $e->errorCode);
        }
    }

    public function test_a_wrong_password_while_throttled_is_429_and_does_not_extend_the_lock(): void
    {
        // This is what pins the ORDER: the throttle is checked before the hash
        // comparison, so once locked, every answer is "stop asking" rather than
        // "that is not your password" — and hit() is never reached, so hammering
        // a locked account cannot push the lock further out.
        //
        // Written after mutation testing: moving the throttle check to AFTER the
        // comparison left the rest of this file green, because the only
        // throttled case it exercised used the CORRECT password, which both
        // orders refuse. Only a wrong password while throttled tells them apart.
        $actor = $this->actor();
        $key = 'reauth:'.$actor->getKey();

        for ($i = 0; $i < 5; $i++) {
            try {
                Reauthentication::assert($actor, 'wrong');
            } catch (ReauthenticationFailed) {
                // expected
            }
        }

        $attemptsWhenLocked = RateLimiter::attempts($key);

        try {
            Reauthentication::assert($actor, 'still-wrong');
            $this->fail('Expected ReauthenticationFailed');
        } catch (ReauthenticationFailed $e) {
            $this->assertSame(429, $e->status, 'a throttled actor is told to stop asking, not that the password was wrong');
            $this->assertSame('too_many_attempts', $e->errorCode);
        }

        $this->assertSame(
            $attemptsWhenLocked,
            RateLimiter::attempts($key),
            'an attempt made while throttled must not be counted',
        );
    }

    public function test_a_success_clears_the_attempt_counter(): void
    {
        $actor = $this->actor();

        for ($i = 0; $i < 4; $i++) {
            try {
                Reauthentication::assert($actor, 'wrong');
            } catch (ReauthenticationFailed) {
                // expected
            }
        }

        Reauthentication::assert($actor, 'correct-horse');

        // Four more must still be allowed: a fumbled password followed by a
        // correct one must not leave the actor one keystroke from a lockout.
        for ($i = 0; $i < 4; $i++) {
            try {
                Reauthentication::assert($actor, 'wrong');
                $this->fail('Expected ReauthenticationFailed');
            } catch (ReauthenticationFailed $e) {
                $this->assertSame(403, $e->status, 'attempt '.($i + 1).' should still be a wrong-password refusal');
            }
        }
    }

    public function test_the_throttle_is_per_actor(): void
    {
        // One member fumbling their password must not lock a colleague out of
        // administering the band.
        $fumbler = $this->actor('fumbler');
        $colleague = $this->actor('colleague');

        for ($i = 0; $i < 6; $i++) {
            try {
                Reauthentication::assert($fumbler, 'wrong');
            } catch (ReauthenticationFailed) {
                // expected
            }
        }

        Reauthentication::assert($colleague, 'correct-horse');

        $this->expectNotToPerformAssertions();
    }
}
