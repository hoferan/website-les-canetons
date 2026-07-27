<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\AltchaController;
use App\Models\User;
use App\Support\Altcha;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The server-owned souper_signup feature flag, on the API side.
 *
 * Before the cutover, app/src/routes.php registered the `signups` and `altcha`
 * endpoint NAMES only inside `if (Features::enabled('souper_signup'))`, so a
 * server with the flag off never had those paths in its route table and the
 * front controller answered 404. The Laravel port registered both
 * unconditionally, which left POST /api/signups accepting anonymous writes for
 * an event the UI had not announced. These tests pin the restored behaviour.
 *
 * Two things are asserted beyond the bare status code:
 *   1. the gated 404 is INDISTINGUISHABLE from a path that was never routed —
 *      same body as /api/<nonsense>, so nothing advertises a switched-off
 *      feature (a 403 would);
 *   2. the gate runs BEFORE auth:sanctum and capability:view_summary, so a
 *      disabled server 404s an anonymous caller instead of 401ing them, and
 *      404s an admin instead of serving the summary.
 *
 * The flag is OFF by default here — phpunit.xml pins SOUPER_SIGNUP_ENABLED=false
 * so the suite does not inherit docker/api/env.docker's `true` through the
 * mounted api-laravel/.env — so the disabled tests set nothing and the enabled
 * ones turn it on explicitly.
 */
class SouperSignupFlagTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'souper-signup-flag-test-secret';

    /** @return array<string, mixed> */
    private function signupPayload(): array
    {
        $challenge = (new Altcha(self::SECRET))->createChallenge(
            50000,
            AltchaController::TTL_SECONDS,
            null,
            4242,
            'aabbccddeeff'
        );

        return [
            'altcha' => base64_encode(json_encode([
                'algorithm' => $challenge['algorithm'],
                'challenge' => $challenge['challenge'],
                'number' => 4242,
                'salt' => $challenge['salt'],
                'signature' => $challenge['signature'],
            ])),
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'address' => 'Rue du Test 1, 1700 Fribourg',
            'phone' => '+41 79 000 00 00',
            'email' => 'ada@example.com',
            'table_name' => 'Table 1',
            'menus' => ['meat'],
        ];
    }

    private function admin(): User
    {
        return User::create(['username' => 'demo.admin', 'password' => 'x', 'role' => 'admin']);
    }

    /**
     * The whole point of throwing the router's own NotFoundHttpException
     * message rather than abort(404): a gated route must look exactly like one
     * that does not exist. Asserted against a genuinely unrouted sibling so it
     * cannot drift if Laravel changes the wording.
     */
    public function test_a_disabled_route_is_indistinguishable_from_an_unrouted_path(): void
    {
        config(['app.souper_signup_enabled' => false]);

        $unrouted = $this->getJson('/api/definitely-not-a-route')->assertStatus(404);
        $gated = $this->getJson('/api/altcha')->assertStatus(404);

        $this->assertSame(
            str_replace('definitely-not-a-route', 'altcha', $unrouted->json('message')),
            $gated->json('message')
        );
        // Not the {error, code} contract: an absent route has no `code`, and
        // ApiErrorContractTest already pins that 404s stay out of it.
        $gated->assertJsonMissingPath('code');
    }

    public function test_the_challenge_endpoint_404s_when_the_feature_is_off(): void
    {
        config([
            'app.souper_signup_enabled' => false,
            // A perfectly good secret: the 404 must come from the flag, not
            // from AltchaController's own fail-closed 503.
            'app.altcha_secret' => self::SECRET,
        ]);

        $this->getJson('/api/altcha')->assertStatus(404);
    }

    public function test_a_valid_signup_is_404ed_and_stored_nowhere_when_the_feature_is_off(): void
    {
        Mail::fake();
        config([
            'app.souper_signup_enabled' => false,
            'app.altcha_secret' => self::SECRET,
        ]);

        // The exact payload that succeeds with the flag on (see the mirror
        // test below), so a 201 here would mean the gate does nothing.
        $this->postJson('/api/signups', $this->signupPayload())->assertStatus(404);

        $this->assertDatabaseCount('signups', 0);
        Mail::assertNothingSent();
    }

    /**
     * The honeypot branch returns 201 before validation and before anything
     * else runs, so it is the one request shape that could slip past a gate
     * registered in the wrong place.
     */
    public function test_even_the_honeypot_branch_404s_when_the_feature_is_off(): void
    {
        config(['app.souper_signup_enabled' => false]);

        $this->postJson('/api/signups', ['hp' => 'i-am-a-bot'])->assertStatus(404);

        $this->assertDatabaseCount('signups', 0);
    }

    /** The gate precedes auth:sanctum: 404, not the usual anonymous 401. */
    public function test_the_admin_summary_404s_for_a_guest_when_the_feature_is_off(): void
    {
        config(['app.souper_signup_enabled' => false]);

        $this->getJson('/api/signups')->assertStatus(404);
    }

    /**
     * The old route table gated the endpoint NAME, so both verbs of /signups
     * went together — the summary describes reservations for an occasion that
     * was never announced. An admin gets the same 404 as everyone else.
     */
    public function test_the_admin_summary_404s_for_an_admin_when_the_feature_is_off(): void
    {
        config(['app.souper_signup_enabled' => false]);

        $this->actingAs($this->admin())->getJson('/api/signups')->assertStatus(404);
    }

    /** No collateral damage: the other public endpoint on the same prefix. */
    public function test_the_contact_endpoint_is_unaffected_by_the_flag(): void
    {
        config(['app.souper_signup_enabled' => false]);

        // 400, not 404: the route still exists and reached validation.
        $this->postJson('/api/contact', [])->assertStatus(400);
    }

    public function test_all_three_routes_come_back_when_the_feature_is_on(): void
    {
        Mail::fake();
        config([
            'app.souper_signup_enabled' => true,
            'app.altcha_secret' => self::SECRET,
        ]);

        $this->getJson('/api/altcha')->assertOk();
        $this->postJson('/api/signups', $this->signupPayload())->assertCreated();
        $this->assertDatabaseCount('signups', 1);

        // Back to its normal boundary rather than the gate's 404.
        $this->getJson('/api/signups')->assertStatus(401)->assertJsonPath('code', 'not_authenticated');
        $this->actingAs($this->admin())->getJson('/api/signups')->assertOk();
    }
}
