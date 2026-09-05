<?php

namespace Tests\Feature;

use App\Models\Member;
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
     * Mirrors AuthController::throttleKey()'s normalisation, so this stays the
     * same bucket the controller reads/clears no matter the case or padding a
     * test (or a future caller) spells the username with.
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
            //
            // assertJsonMissing() searches for 'exception' as a VALUE, never as a
            // key, so a body containing "exception":"QueryException" would still
            // pass it — assertJsonMissingPath() is what actually checks the key
            // is absent.
            ->assertJsonMissingPath('exception');

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

        // Concrete assertions, not just equality: two responses that were both
        // e.g. a 500 with no `code` would satisfy assertSame() below without
        // either actually being the generic-refusal contract this test exists
        // to pin.
        $unknown->assertStatus(401)->assertJson(['code' => 'invalid_credentials']);
        $wrong->assertStatus(401)->assertJson(['code' => 'invalid_credentials']);

        $this->assertSame($unknown->status(), $wrong->status());
        $this->assertSame($unknown->json('code'), $wrong->json('code'));
    }

    /**
     * members.password is nullable by design (see the members migration): a
     * member row is a PERSON, not an account, so an admin can create one with
     * a username assigned but no password yet issued. Auth::attempt() DOES
     * find this row (unlike the null-username case, which is a WHERE that
     * can never match), so this exercises the hasher path with a null hash —
     * exactly the shape of bug this task was created to eliminate, so this
     * must come back as the same generic 401 as every other failure, never a
     * 500, and never a distinct code (a distinct code would let an attacker
     * enumerate which accounts still lack a password).
     */
    public function test_a_member_with_a_username_but_no_password_cannot_log_in(): void
    {
        Member::create([
            'first_name' => 'Petit',
            'last_name' => 'Canard',
            'username' => 'petit.canard',
            'password' => null,
        ]);

        $this->spaPostJson('/api/login', [
            'username' => 'petit.canard',
            'password' => 'whatever',
        ])->assertStatus(401)
            ->assertJson(['code' => 'invalid_credentials'])
            ->assertJsonMissingPath('exception');

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

    public function test_the_throttle_survives_a_different_case_or_padding(): void
    {
        // Proves the throttle key is normalised: members.username collates
        // utf8mb4_unicode_ci (case-insensitive, PAD SPACE), so the database
        // authenticates spellings a raw concatenation would count as separate
        // RateLimiter buckets. Without Str::lower(trim(...)) in throttleKey(),
        // an attacker who exhausts the limit as "lea.keller" walks straight
        // past it by resubmitting "LEA.Keller" — even with the CORRECT
        // password.
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        $this->spaPostJson('/api/login', [
            'username' => 'LEA.Keller',
            'password' => 'secret123',
        ])->assertStatus(429)->assertJson(['code' => 'too_many_attempts']);

        $this->assertGuest();
    }

    public function test_the_lockout_decay_window_is_fifteen_minutes(): void
    {
        // Pins the decay window itself, not merely that SOME lock exists —
        // RateLimiter::hit()'s cache->add() sets the TTL once, on the first
        // failure, and never extends it, so a DECAY_SECONDS regression (e.g.
        // back to 60, or to 0) would still throttle the very next request and
        // slip past every other test here.
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        // Both bounds matter: the floor alone would also pass at 90000
        // seconds despite the test's name promising fifteen minutes (900s).
        $availableIn = RateLimiter::availableIn($this->throttleKey());
        $this->assertGreaterThan(800, $availableIn);
        $this->assertLessThan(1000, $availableIn);
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

        // App\Http\Middleware\EnforceAbsoluteSessionLifetime (appended to the
        // `api` group) reads auth.started_at off the request's session, so
        // this actingAs() call needs the stamp too — see MeTest for the full
        // explanation. The Origin header was already here.
        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
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
