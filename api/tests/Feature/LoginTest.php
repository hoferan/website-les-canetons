<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
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

    /**
     * Mirrors AuthController::throttleKey()'s normalisation, so this is the
     * bucket the controller reads and clears whatever the username's case or
     * padding.
     */
    private function throttleKey(string $username = 'lea.keller'): string
    {
        return 'login:'.Str::lower(trim($username)).'|127.0.0.1';
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
        return Member::factory()->named('Léa', 'Keller', 'lea.keller')->create();
    }

    public function test_valid_credentials_authenticate(): void
    {
        $this->member();

        $this->spaPostJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk()->assertJson(['ok' => true]);

        $this->assertAuthenticated();
    }

    public function test_a_successful_login_records_the_time(): void
    {
        $member = $this->member();
        $this->assertNull($member->last_login_at);

        $this->spaPostJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertNotNull($member->fresh()->last_login_at);
    }

    public function test_a_wrong_password_is_refused_generically(): void
    {
        $this->member();

        $this->spaPostJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ])->assertStatus(401)
            ->assertJson(['code' => 'invalid_credentials'])
            // The problem document, not Laravel's native {message, exception,
            // trace}. assertJsonMissing() searches for 'exception' as a value,
            // never as a key; assertJsonMissingPath() checks the key.
            ->assertJsonMissingPath('exception');

        $this->assertGuest();
    }

    public function test_an_unknown_username_gives_the_same_answer_as_a_wrong_password(): void
    {
        // Anything else enables username enumeration.
        $this->member();

        $unknown = $this->spaPostJson('/api/v1/login', [
            'username' => 'nobody',
            'password' => 'secret123',
        ]);
        $wrong = $this->spaPostJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ]);

        // Concrete assertions as well as equality: two 500s with no `code`
        // would satisfy assertSame() below.
        $unknown->assertStatus(401)->assertJson(['code' => 'invalid_credentials']);
        $wrong->assertStatus(401)->assertJson(['code' => 'invalid_credentials']);

        $this->assertSame($unknown->status(), $wrong->status());
        $this->assertSame($unknown->json('code'), $wrong->json('code'));
    }

    /**
     * Every member has an account (ADR 0015), so both credentials are NOT NULL
     * (2026_09_08_000001). The schema, not the login path, keeps a member
     * without a password from reaching the hasher.
     */
    public function test_a_member_with_a_username_but_no_password_is_impossible(): void
    {
        // By hand, not through the factory, which supplies valid credentials.
        $this->expectException(QueryException::class);

        Member::create([
            'first_name' => 'Petit',
            'last_name' => 'Canard',
            'username' => 'petit.canard',
            'password' => null,
        ]);
    }

    public function test_repeated_failures_are_throttled(): void
    {
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/v1/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ])->assertStatus(401);
        }

        $this->spaPostJson('/api/v1/login', [
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
            $this->spaPostJson('/api/v1/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        $this->spaPostJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertStatus(429);

        $this->assertGuest();
    }

    public function test_the_throttle_survives_a_different_case_or_padding(): void
    {
        // members.username collates utf8mb4_unicode_ci (case-insensitive, PAD
        // SPACE), so the database authenticates spellings a raw key would
        // count as separate buckets. Without Str::lower(trim(...)) in
        // throttleKey(), "LEA.Keller" would walk past the limit exhausted as
        // "lea.keller".
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/v1/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        $this->spaPostJson('/api/v1/login', [
            'username' => 'LEA.Keller',
            'password' => 'secret123',
        ])->assertStatus(429)->assertJson(['code' => 'too_many_attempts']);

        $this->assertGuest();
    }

    public function test_the_lockout_decay_window_is_fifteen_minutes(): void
    {
        // Pins the decay window itself. RateLimiter::hit() sets the TTL once,
        // on the first failure, so a shorter DECAY_SECONDS would still
        // throttle the next request and pass every other test here.
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/v1/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        // Both bounds: the floor alone would also pass at 90000 seconds.
        $availableIn = RateLimiter::availableIn($this->throttleKey());
        $this->assertGreaterThan(800, $availableIn);
        $this->assertLessThan(1000, $availableIn);
    }

    public function test_a_successful_login_clears_the_counter(): void
    {
        $this->member();

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->spaPostJson('/api/v1/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        $this->spaPostJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertSame(0, RateLimiter::attempts($this->throttleKey()));
    }

    public function test_logout_ends_the_session(): void
    {
        $member = $this->member();

        // actingAsMember() stamps auth.started_at, which
        // EnforceAbsoluteSessionLifetime reads; MeTest explains it.
        $this->actingAsMember($member)
            ->postJson('/api/v1/logout')
            ->assertOk()->assertJson(['ok' => true]);

        // The 'web' guard on purpose. Behind auth:sanctum, Authenticate calls
        // Auth::shouldUse('sanctum'), so a guard-less assertGuest() would check
        // the sanctum RequestGuard, which memoizes the user it resolved for
        // this simulated request and still reports authenticated. A real next
        // request re-derives from the cleared session. AuthController::logout()
        // logs out the 'web' guard, so that is what this asserts.
        $this->assertGuest('web');
    }
}
