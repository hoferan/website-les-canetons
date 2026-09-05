<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SessionLifetimeTest extends TestCase
{
    use RefreshDatabase;

    private function member(): Member
    {
        return Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);
    }

    public function test_the_session_cookie_is_secure_http_only_and_strict(): void
    {
        $this->assertTrue(config('session.http_only'));
        $this->assertSame('strict', config('session.same_site'));
        $this->assertTrue(
            config('session.secure'),
            'SESSION_SECURE_COOKIE must default to true; local http dev overrides it.',
        );
    }

    public function test_login_stamps_the_session_start(): void
    {
        $this->member();

        $this->withHeaders(['Origin' => 'http://localhost'])
            ->postJson('/api/login', ['username' => 'lea.keller', 'password' => 'secret123'])
            ->assertOk();

        $this->assertNotNull(session('auth.started_at'));
    }

    public function test_a_fresh_session_is_accepted(): void
    {
        $member = $this->member();

        // The Origin header is what makes Sanctum's EnsureFrontendRequestsAreStateful
        // treat this as a stateful frontend request and actually run StartSession
        // for it (Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::
        // fromFrontend()) — without it the request never gets a session attached
        // at all and $request->session() in the new middleware throws a bare
        // RuntimeException instead of exercising the 401 path under test. A real
        // browser always sends one on a same-origin request; withSession() alone
        // only seeds the container's session singleton, not this simulated
        // request's own session store. Mirrors LoginTest::spaPostJson().
        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/me')
            ->assertOk();
    }

    public function test_a_session_older_than_the_absolute_lifetime_is_refused(): void
    {
        $member = $this->member();
        $tooOld = now()->subMinutes(config('session.absolute_lifetime') + 1)->timestamp;

        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => $tooOld])
            ->getJson('/api/me')
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);
    }

    public function test_a_session_with_no_stamp_is_refused(): void
    {
        // A session predating this middleware, or one forged by hand. Failing
        // closed is the only safe reading of "we do not know when this began".
        $member = $this->member();

        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession([])
            ->getJson('/api/me')
            ->assertStatus(401);
    }
}
