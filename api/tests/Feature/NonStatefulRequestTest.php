<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Logging in from a request Sanctum does not treat as stateful.
 *
 * `$request->session()` throws when no session store is attached, which would
 * be a 500 with a stack trace to an anonymous caller. Every other login test
 * sets an `Origin` matching SANCTUM_STATEFUL_DOMAINS, as the SPA does, so only
 * this file drives the non-stateful path. Only correct credentials reach the
 * session call; a wrong password answers 401 before it.
 *
 * The tests drive the real endpoint, and the difference between them is one
 * header.
 */
class NonStatefulRequestTest extends TestCase
{
    use RefreshDatabase;

    private function member(): Member
    {
        return Member::factory()->named('Léa', 'Keller', 'lea.keller')->create();
    }

    /** What the SPA sends: an Origin whose host is a configured stateful domain. */
    private function statefulPostJson(string $uri, array $data = []): TestResponse
    {
        return $this->withHeaders(['Origin' => 'http://localhost'])->postJson($uri, $data);
    }

    /** Valid credentials, no Origin. */
    public function test_valid_credentials_without_a_stateful_origin_are_refused_cleanly(): void
    {
        $this->member();

        $response = $this->postJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);

        $response->assertStatus(400);
        $this->assertSame('application/problem+json', $response->headers->get('Content-Type'));
        $response->assertJsonPath('code', 'stateful_request_required');

        // Not 419 invalid_session, whose detail says "prime the cookie and
        // retry": a request does not become stateful by being repeated.
        $this->assertNotSame('invalid_session', $response->json('code'));
    }

    /**
     * Asserted separately because it matters on a server with APP_DEBUG on. A
     * body carrying `exception`, `trace` or a vendor path leaks internals.
     */
    public function test_the_refusal_leaks_no_internals(): void
    {
        $this->member();

        $body = (string) $this->postJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->getContent();

        $this->assertStringNotContainsString('"exception"', $body);
        $this->assertStringNotContainsString('"trace"', $body);
        $this->assertStringNotContainsString('vendor/laravel', $body);
        $this->assertStringNotContainsString('AuthController', $body);
    }

    /**
     * The same request with the header the SPA sends, which shows the guard
     * discriminates on statefulness and nothing incidental.
     */
    public function test_the_same_credentials_with_a_stateful_origin_still_work(): void
    {
        $this->member();

        $this->statefulPostJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk()->assertJson(['ok' => true]);

        $this->assertAuthenticated();
    }

    /**
     * The guard sits after the credential check on purpose.
     *
     * Before it, it would answer differently for a right and a wrong password
     * on a non-stateful request, an oracle that confirms credentials without
     * establishing a session.
     */
    public function test_a_wrong_password_is_still_a_generic_401_without_an_origin(): void
    {
        $this->member();

        $this->postJson('/api/v1/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ])->assertStatus(401)->assertJsonPath('code', 'invalid_credentials');
    }

    /**
     * The dev stack lists `localhost:*`, and this is what says that works.
     *
     * Each git worktree runs its own Vite dev server on whatever port was free
     * (:5173 belongs to the compose `assets` container), so the ports cannot be
     * listed in advance. A missing port shows as a SPA that renders and cannot
     * sign in.
     *
     * Sanctum matches with Str::is(), so `*` is a pattern. This asserts it.
     */
    public function test_a_wildcard_stateful_domain_accepts_any_local_port(): void
    {
        config(['sanctum.stateful' => ['localhost:*', '127.0.0.1:*']]);

        $this->member();

        $this->withHeaders(['Origin' => 'http://localhost:5175'])
            ->postJson('/api/v1/login', [
                'username' => 'lea.keller',
                'password' => 'secret123',
            ])->assertOk()->assertJson(['ok' => true]);
    }

    /**
     * The same request against an explicit host:port list: a dev server on a
     * port outside it cannot log in. This is the counterpart that makes the
     * test above meaningful.
     */
    public function test_a_port_outside_an_explicit_list_is_refused(): void
    {
        config(['sanctum.stateful' => ['localhost:8090', 'localhost:5173']]);

        $this->member();

        $this->withHeaders(['Origin' => 'http://localhost:5175'])
            ->postJson('/api/v1/login', [
                'username' => 'lea.keller',
                'password' => 'secret123',
            ])->assertStatus(400)->assertJsonPath('code', 'stateful_request_required');
    }

    /**
     * The wildcard widens the port and nothing else.
     *
     * A host that is not this machine stays non-stateful, so the cookie never
     * applies to it. That is why `localhost:*` is acceptable in a dev file.
     */
    public function test_the_wildcard_does_not_accept_another_host(): void
    {
        config(['sanctum.stateful' => ['localhost:*', '127.0.0.1:*']]);

        $this->member();

        $this->withHeaders(['Origin' => 'http://evil.test:5175'])
            ->postJson('/api/v1/login', [
                'username' => 'lea.keller',
                'password' => 'secret123',
            ])->assertStatus(400)->assertJsonPath('code', 'stateful_request_required');
    }

    /**
     * An unknown username answers the same as a wrong password without a
     * session too, so the guard opens no enumeration hole.
     */
    public function test_an_unknown_username_answers_the_same_without_an_origin(): void
    {
        $this->postJson('/api/v1/login', [
            'username' => 'nobody.here',
            'password' => 'wrong',
        ])->assertStatus(401)->assertJsonPath('code', 'invalid_credentials');
    }
}
