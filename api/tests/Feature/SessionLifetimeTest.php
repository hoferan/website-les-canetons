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
        return Member::factory()->named('Léa', 'Keller', 'lea.keller')->create();
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

        // This one asserts THE SUITE'S OWN POSTURE, not the application
        // default: api/phpunit.xml pins SESSION_SECURE_COOKIE=true so that
        // every test here runs configured the way a deployed server is, and
        // this line is what fails if that pin is ever dropped. It says nothing
        // about config/session.php's fallback — with the pin in place it would
        // pass against Laravel's stock, insecure default too. The fallback is
        // the property that actually protects a real server, and it has its own
        // test below.
        $this->assertTrue(
            config('session.secure'),
            'api/phpunit.xml must pin SESSION_SECURE_COOKIE=true, or this suite '.
            'measures the plain-http dev override in docker/api/env.docker.',
        );
    }

    /**
     * A DEPLOYED server's `.env` omits SESSION_SECURE_COOKIE entirely
     * (api/.env.example says so in as many words), so the whole security of the
     * session cookie rests on config/session.php's fallback being `true` rather
     * than Laravel's stock `env('SESSION_SECURE_COOKIE')`, which resolves to
     * false and ships the session cookie over plain http.
     *
     * That fallback cannot be read off config('session.secure') anywhere in
     * this suite: something always sets the variable. api/phpunit.xml pins it
     * true (deliberately — see the comment there), and underneath that
     * docker/api/env.docker sets it false, because local dev is plain http and
     * a Secure-only cookie is one a browser will not send back, which breaks
     * login on :8090 outright. Both are legitimate; neither says anything about
     * what a real server gets.
     *
     * So this re-evaluates the config file with the variable absent from every
     * adapter Illuminate\Support\Env consults — $_ENV, $_SERVER and putenv.
     * Env::getOption() reads the repository live on every call and memoizes
     * nothing, so a fresh `require` of the file sees the cleared state and
     * yields the true default.
     */
    public function test_the_secure_cookie_default_is_true_when_a_server_sets_nothing(): void
    {
        $config = $this->sessionConfigWithout('SESSION_SECURE_COOKIE');

        $this->assertTrue(
            $config['secure'],
            'config/session.php must default session.secure to true, so a server whose '.
            '.env omits SESSION_SECURE_COOKIE still gets a Secure-only cookie.',
        );
    }

    /**
     * The session config as it evaluates on a server that sets $variable
     * nowhere. Restores the environment afterwards whatever happens — leaking a
     * cleared SESSION_SECURE_COOKIE into the rest of the suite would silently
     * change what every later test measures.
     *
     * @return array<string, mixed>
     */
    private function sessionConfigWithout(string $variable): array
    {
        $fromEnv = array_key_exists($variable, $_ENV) ? $_ENV[$variable] : null;
        $fromServer = array_key_exists($variable, $_SERVER) ? $_SERVER[$variable] : null;
        $fromProcess = getenv($variable);

        unset($_ENV[$variable], $_SERVER[$variable]);
        putenv($variable);

        try {
            return require config_path('session.php');
        } finally {
            if ($fromEnv !== null) {
                $_ENV[$variable] = $fromEnv;
            }
            if ($fromServer !== null) {
                $_SERVER[$variable] = $fromServer;
            }
            if ($fromProcess !== false) {
                putenv("{$variable}={$fromProcess}");
            }
        }
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
            ->postJson('/api/v1/login', ['username' => 'lea.keller', 'password' => 'secret123'])
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
            ->postJson('/api/v1/login', ['username' => 'lea.keller', 'password' => 'secret123'])
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
        $this->actingAsMember($member)
            ->getJson('/api/v1/me')
            ->assertOk();
    }

    public function test_a_session_older_than_the_absolute_lifetime_is_refused(): void
    {
        $member = $this->member();
        $tooOld = now()->subMinutes(config('session.absolute_lifetime') + 1)->timestamp;

        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => $tooOld])
            ->getJson('/api/v1/me')
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
            ->getJson('/api/v1/me')
            ->assertStatus(401);
    }
}
