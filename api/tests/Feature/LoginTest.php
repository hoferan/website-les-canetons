<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear($this->throttleKey());
    }

    private function throttleKey(string $username = 'lea.keller'): string
    {
        return 'login:'.$username.'|127.0.0.1';
    }

    /**
     * Sanctum's statefulApi() only starts a session for a request carrying an
     * Origin whose host is in SANCTUM_STATEFUL_DOMAINS. phpunit.xml pins
     * `localhost`, so this mirrors how the real same-origin SPA arrives.
     *
     * @param  array<string, mixed>  $data
     */
    private function spaPostJson(string $uri, array $data = []): TestResponse
    {
        return $this->withHeaders(['Origin' => 'http://localhost'])->postJson($uri, $data);
    }

    private function member(): Member
    {
        return Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);
    }

    public function test_valid_credentials_authenticate(): void
    {
        $this->member();

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk()->assertJson(['ok' => true]);

        $this->assertAuthenticated();
    }

    public function test_a_successful_login_records_the_time(): void
    {
        $member = $this->member();
        $this->assertNull($member->last_login_at);

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertNotNull($member->fresh()->last_login_at);
    }

    public function test_a_wrong_password_is_refused_generically(): void
    {
        $this->member();

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ])->assertStatus(401)
            ->assertJson(['code' => 'invalid_credentials'])
            // Ported from the now-deleted LoginSmokeTest: pins the {error, code,
            // fields[]} contract, not Laravel's native {message, exception, trace}.
            ->assertJsonMissing(['exception']);

        $this->assertGuest();
    }

    public function test_an_unknown_username_gives_the_same_answer_as_a_wrong_password(): void
    {
        // Anything else enables username enumeration.
        $this->member();

        $unknown = $this->spaPostJson('/api/login', [
            'username' => 'nobody',
            'password' => 'secret123',
        ]);
        $wrong = $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ]);

        $this->assertSame($unknown->status(), $wrong->status());
        $this->assertSame($unknown->json('code'), $wrong->json('code'));
    }

    public function test_a_member_without_a_username_cannot_log_in(): void
    {
        Member::create(['first_name' => 'Petit', 'last_name' => 'Canard']);

        $this->spaPostJson('/api/login', [
            'username' => '',
            'password' => 'anything',
        ])->assertStatus(400)->assertJson(['code' => 'validation_failed']);

        $this->assertGuest();
    }

    public function test_repeated_failures_are_throttled(): void
    {
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ])->assertStatus(401);
        }

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ])->assertStatus(429)->assertJson(['code' => 'too_many_attempts']);
    }

    public function test_throttling_blocks_even_the_correct_password(): void
    {
        // Otherwise an attacker who guesses right on attempt 200 is unaffected
        // by the limit.
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertStatus(429);

        $this->assertGuest();
    }

    public function test_a_successful_login_clears_the_counter(): void
    {
        $this->member();

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->spaPostJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertSame(0, RateLimiter::attempts($this->throttleKey()));
    }

    public function test_logout_ends_the_session(): void
    {
        $member = $this->member();

        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->postJson('/api/logout')
            ->assertOk()->assertJson(['ok' => true]);

        // Pinned to the 'web' guard deliberately. /api/logout sits behind
        // auth:sanctum, and Illuminate\Auth\Middleware\Authenticate::authenticate()
        // calls Auth::shouldUse('sanctum') once it passes — so a guard-less
        // assertGuest() would check the 'sanctum' RequestGuard instead. That guard
        // memoizes the user it resolved for THIS simulated request and is never
        // reconstructed for the assertion that follows in the same test process,
        // so it still reports authenticated no matter what logout() did — a
        // testing-harness artifact (a real subsequent request builds a fresh
        // RequestGuard that re-derives from the session, which IS cleared).
        // Asserting the 'web' guard is what actually pins the production-relevant
        // behaviour: AuthController::logout() calls Auth::guard('web')->logout().
        $this->assertGuest('web');
    }
}
