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
        // This checks the configuration file only. Sanctum's
        // EnsureFrontendRequestsAreStateful overrides session.same_site to
        // "lax" at runtime on every `api` request, so this can pass while the
        // real Set-Cookie header says otherwise.
        // test_the_session_cookie_carries_strict_secure_and_http_only reads
        // the actual header.
        $this->assertTrue(config('session.http_only'));
        $this->assertSame('strict', config('session.same_site'));

        // This asserts the suite's own posture: api/phpunit.xml pins
        // SESSION_SECURE_COOKIE=true so every test runs configured like a
        // deployed server, and this line fails if the pin is dropped. It says
        // nothing about config/session.php's fallback, which has its own test
        // below.
        $this->assertTrue(
            config('session.secure'),
            'api/phpunit.xml must pin SESSION_SECURE_COOKIE=true, or this suite '.
            'measures the plain-http dev override in docker/api/env.docker.',
        );
    }

    /**
     * A deployed server's `.env` omits SESSION_SECURE_COOKIE (see
     * api/.env.example), so the cookie's security rests on config/session.php
     * falling back to `true`. Laravel's stock fallback resolves to false and
     * ships the session cookie over plain http.
     *
     * config('session.secure') cannot show that fallback here, because
     * something always sets the variable: api/phpunit.xml pins it true, and
     * docker/api/env.docker sets it false because local dev is plain http and
     * a browser does not send a Secure-only cookie back there.
     *
     * So this re-evaluates the config file with the variable absent from every
     * adapter Illuminate\Support\Env consults ($_ENV, $_SERVER and putenv).
     * Env::getOption() reads the repository live and memoizes nothing, so a
     * fresh `require` sees the cleared state.
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
     * nowhere. Restores the environment afterwards whatever happens, or a
     * cleared variable would change what every later test measures.
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
     * Pins the real Set-Cookie header a login response sends. Sanctum's
     * EnsureFrontendRequestsAreStateful::configureSecureCookieSessions() forces
     * session.same_site to "lax" on every /api request;
     * App\Http\Middleware\EnforceAbsoluteSessionLifetime restores the
     * configured value before StartSession builds this header. Without it the
     * cookie says SameSite=Lax although config/session.php says "strict".
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

    /**
     * The absolute lifetime is measured on the clock the application uses, not
     * on the wall clock.
     *
     * A check that read `time()` would ignore Carbon's test clock: travelling
     * past the lifetime would leave the session valid, and travelling
     * backwards would expire one that had just started. EventIndexTest
     * travels to 10:00 today for an unrelated rule, so with `time()` every one
     * of its requests would answer 401 after 22:00 local.
     *
     * Both directions are tested. The second fails if the stamp and the check
     * ever read different clocks.
     */
    public function test_the_absolute_lifetime_follows_the_applications_clock(): void
    {
        $member = $this->member();
        $lifetime = (int) config('session.absolute_lifetime');

        $session = $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp]);

        $this->travel($lifetime + 1)->minutes();

        $session->getJson('/api/v1/me')->assertStatus(401);

        $this->travelBack();

        // The other direction: a session stamped at the travelled time is as
        // fresh as one stamped now, however far from the wall clock it is.
        $this->travelTo(now()->subHours(13));

        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/v1/me')
            ->assertOk();
    }

    public function test_a_session_with_no_stamp_is_refused(): void
    {
        // A session predating this middleware, or one forged by hand. With no
        // known start, the middleware fails closed.
        $member = $this->member();

        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession([])
            ->getJson('/api/v1/me')
            ->assertStatus(401);
    }
}
