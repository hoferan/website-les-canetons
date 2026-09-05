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

    public function test_the_session_configuration_is_secure_http_only_and_strict(): void
    {
        // This checks the CONFIGURATION FILE, not what a real response actually
        // sends: Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful
        // unconditionally overrides session.same_site to "lax" at runtime on
        // every request through the `api` group, so config('session.same_site')
        // read outside a request (as here) can pass while the real Set-Cookie
        // header ships something else entirely. See
        // test_the_session_cookie_carries_strict_secure_and_http_only below for
        // the behavioural assertion, which reads the actual header off a real
        // response.
        $this->assertTrue(config('session.http_only'));
        $this->assertSame('strict', config('session.same_site'));
        $this->assertTrue(
            config('session.secure'),
            'SESSION_SECURE_COOKIE must default to true; local http dev overrides it.',
        );
    }

    /**
     * Pins the REAL Set-Cookie header a login response sends, not the config
     * file. Sanctum's EnsureFrontendRequestsAreStateful::
     * configureSecureCookieSessions() unconditionally forces
     * session.same_site to "lax" on every /api request — see
     * App\Http\Middleware\EnforceAbsoluteSessionLifetime for the fix that
     * restores the configured value before
     * Illuminate\Session\Middleware\StartSession builds this header on the way
     * out. Without that fix, this test fails with SameSite=Lax even though
     * config/session.php says "strict".
     */
    public function test_the_session_cookie_carries_strict_secure_and_http_only(): void
    {
        $this->member();

        $response = $this->withHeaders(['Origin' => 'http://localhost'])
            ->postJson('/api/login', ['username' => 'lea.keller', 'password' => 'secret123'])
            ->assertOk();

        $cookie = collect($response->headers->getCookies())
            ->first(fn ($cookie) => $cookie->getName() === config('session.cookie'));

        $this->assertNotNull($cookie, 'the login response must set the session cookie');
        $this->assertSame('strict', $cookie->getSameSite());
        $this->assertTrue($cookie->isSecure());
        $this->assertTrue($cookie->isHttpOnly());
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
