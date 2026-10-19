<?php

namespace Tests\Feature;

use App\Exceptions\ReauthenticationFailed;
use App\Models\Member;
use App\Support\Reauthentication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Re-proving who you are, immediately before something irreversible. Its one
 * caller is POST /me/password (ADR 0017).
 *
 * The threat is an authenticated caller. Without a limit, an attacker holding a
 * stolen session cookie has a password oracle: a yes/no answer about the
 * account's real password, as fast as the host will serve it.
 */
class ReauthenticationTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $username = 'admin', ?string $password = 'correct-horse'): Member
    {
        return Member::factory()
            ->named('Alex', 'Actor', $username)
            ->withPassword($password)
            ->create();
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
            // 403, not 401: the session is valid and the caller holds the
            // permission. Only the re-proof failed.
            $this->assertSame(403, $e->status);
            $this->assertSame('reauth_failed', $e->errorCode);
        }
    }

    public function test_a_credential_less_member_cannot_reauthenticate(): void
    {
        // Fails closed. Both credentials are NOT NULL, so a persisted member
        // always has a password; an unsaved model reaches the branch.
        //
        // This pins the outcome only. Laravel's hasher already returns false
        // for a null hash, so the explicit guard in Reauthentication is not
        // observable from here.
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
            // The correct password: a throttled actor is refused anyway, or the
            // limit does nothing. The login throttle in AuthController does the
            // same.
            Reauthentication::assert($actor, 'correct-horse');
            $this->fail('Expected ReauthenticationFailed');
        } catch (ReauthenticationFailed $e) {
            $this->assertSame(429, $e->status);
            $this->assertSame('too_many_attempts', $e->errorCode);
        }
    }

    public function test_a_wrong_password_while_throttled_is_429_and_does_not_extend_the_lock(): void
    {
        // Pins the order: the throttle is checked before the hash comparison,
        // so once locked every answer is "stop asking", and hit() is never
        // reached, so hammering a locked account cannot push the lock further
        // out. The test above uses the correct password, which both orders
        // refuse; only a wrong password while throttled tells them apart.
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

        // Four more are still allowed, so a fumbled password followed by a
        // correct one does not leave the actor one attempt from a lockout.
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
