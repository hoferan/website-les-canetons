<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Logging in from a request Sanctum does not treat as stateful.
 *
 * FOUND BY A BLACK-BOX REVIEW on 2026-09-11. `POST /api/v1/login` called
 * `$request->session()` unguarded, which throws when no session store is
 * attached — surfacing as a 500 carrying a stack trace that named the
 * controller and line, to an anonymous caller, on the first request any
 * server-side integrator makes.
 *
 * WHY 452 GREEN TESTS MISSED IT, which is the part worth keeping: every
 * existing login test goes through a helper that sets an `Origin` matching
 * SANCTUM_STATEFUL_DOMAINS, because that is what the SPA does. The suite
 * therefore exercised the one path that works, thoroughly. The bug lived in the
 * path nothing internal had any reason to drive — and a reviewer with no such
 * helper hit it on their first call.
 *
 * It also only bit on CORRECT credentials: a wrong password returns 401 before
 * reaching the session call, so probing looked healthy.
 *
 * These tests drive the real endpoint, and the difference between them is one
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

    /** THE REGRESSION. Valid credentials, no Origin — this was the 500. */
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

        // Not 419 invalid_session, whose own detail says "prime the cookie and
        // retry" — advice that loops forever here, because a request does not
        // become stateful by being repeated.
        $this->assertNotSame('invalid_session', $response->json('code'));
    }

    /**
     * The leak half, asserted separately because it is the half that matters on
     * a server with APP_DEBUG on. A body carrying `exception`, `trace` or a
     * vendor path means the contract was escaped and internals went with it.
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
     * The same request with the header the SPA sends. One header apart from the
     * test above, which is what makes the pair meaningful: it shows the guard
     * discriminates on statefulness and not on something incidental.
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
     * The guard sits AFTER the credential check, deliberately.
     *
     * Otherwise it would answer differently for a right and a wrong password on
     * a non-stateful request — turning a hardening fix into an oracle that
     * confirms credentials without ever establishing a session.
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
     * And an unknown username answers the same as a wrong password with no
     * session either — the enumeration defence must not gain a hole from the
     * new branch.
     */
    public function test_an_unknown_username_answers_the_same_without_an_origin(): void
    {
        $this->postJson('/api/v1/login', [
            'username' => 'nobody.here',
            'password' => 'wrong',
        ])->assertStatus(401)->assertJsonPath('code', 'invalid_credentials');
    }
}
