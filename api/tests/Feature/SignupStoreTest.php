<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\AltchaController;
use App\Mail\SignupConfirmation;
use App\Models\Signup;
use App\Support\Altcha;
use App\Support\Occasion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\TestCase;

/**
 * POST /api/signups — the public reservation form.
 *
 * Four security properties, and the ORDER they run in, are the point of this
 * file: honeypot (silently 201) before validation, then validation, then the
 * fail-closed proof-of-work gate plus the single-use replay guard, and only
 * then the insert followed by a fail-safe mail send. Each is pinned below, and
 * the two ordering properties are pinned by tests that would pass under the
 * wrong order only if the response leaked the difference.
 */
class SignupStoreTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'signup-store-test-secret';

    /** Field names are snake_case: what signup.js posts and i18n.js looks up. */
    private const VALID = [
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
        'address' => 'Rue du Test 1, 1700 Fribourg',
        'phone' => '+41 79 000 00 00',
        'email' => 'ada@example.com',
        'table_name' => 'Table 1',
        'menus' => ['meat', 'child'],
    ];

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.altcha_secret' => self::SECRET]);
    }

    /**
     * A genuinely solved challenge, the way the browser widget produces one:
     * base64 of {algorithm, challenge, number, salt, signature}. Same helper as
     * tests/Unit/AltchaTest.php's solve(), with the challenge created here.
     *
     * $secret defaults to the configured one; tests that pin fail-closed
     * behaviour sign with the very secret the server is (mis)configured with, so
     * the payload itself is valid and ONLY the guard can reject it.
     */
    private function solved(?string $secret = null, int $number = 4242, string $saltHex = 'aabbccddeeff'): string
    {
        $challenge = (new Altcha($secret ?? self::SECRET))->createChallenge(
            50000,
            AltchaController::TTL_SECONDS,
            null,
            $number,
            $saltHex
        );

        return base64_encode(json_encode([
            'algorithm' => $challenge['algorithm'],
            'challenge' => $challenge['challenge'],
            'number' => $number,
            'salt' => $challenge['salt'],
            'signature' => $challenge['signature'],
        ]));
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return $overrides + ['altcha' => $this->solved()] + self::VALID;
    }

    public function test_it_stores_a_signup_and_sends_the_confirmation(): void
    {
        Mail::fake();

        $this->postJson('/api/signups', $this->payload())
            ->assertCreated()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('signups', [
            'occasion' => Occasion::ACTIVE,
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'address' => 'Rue du Test 1, 1700 Fribourg',
            'phone' => '+41 79 000 00 00',
            'email' => 'ada@example.com',
            'table_name' => 'Table 1',
            'menus' => json_encode(['meat', 'child']),
        ]);

        Mail::assertSent(SignupConfirmation::class, function (SignupConfirmation $mail) {
            $body = $mail->buildBody();

            return str_contains($body, 'Bonjour Ada Lovelace,')
                && str_contains($body, '- Viande : 1')
                && str_contains($body, '- Enfant : 1')
                && str_contains($body, '- Total : 2 personne(s)')
                && $mail->envelope()->to[0]->address === 'ada@example.com';
        });
    }

    public function test_the_occasion_is_fixed_server_side(): void
    {
        Mail::fake();

        $this->postJson('/api/signups', $this->payload(['occasion' => 'hacked']))
            ->assertCreated();

        $this->assertSame(Occasion::ACTIVE, Signup::sole()->occasion);
    }

    public function test_a_filled_honeypot_is_silently_accepted(): void
    {
        Mail::fake();

        // Indistinguishable from success, so a bot never learns it was trapped.
        $this->postJson('/api/signups', $this->payload(['hp' => 'i-am-a-bot']))
            ->assertCreated()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('signups', 0);
        Mail::assertNothingSent();
    }

    public function test_a_filled_honeypot_precedes_validation(): void
    {
        Mail::fake();

        // Nothing here would survive validation, and there is no altcha at all.
        // A 201 can only mean the honeypot was checked first.
        $this->postJson('/api/signups', ['hp' => 'x', 'menus' => ['nope']])
            ->assertCreated()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('signups', 0);
        Mail::assertNothingSent();
    }

    public function test_it_reports_missing_fields_with_snake_case_names(): void
    {
        $response = $this->postJson('/api/signups', []);

        $response->assertStatus(400)->assertJsonPath('code', 'validation_failed');

        // These names must match i18n.js's fields.* keys exactly. `menus` comes
        // last because it is added by the after() hook, not by a rule.
        $this->assertSame(
            ['first_name', 'last_name', 'address', 'phone', 'email', 'table_name', 'menus'],
            array_column($response->json('fields'), 'field')
        );
        $this->assertDatabaseCount('signups', 0);
    }

    public function test_an_invalid_menu_value_is_rejected(): void
    {
        $response = $this->postJson('/api/signups', $this->payload(['menus' => ['caviar']]));

        $response->assertStatus(400)->assertJsonPath('fields', [
            ['field' => 'menus', 'reason' => 'invalid_value'],
        ]);
        $this->assertDatabaseCount('signups', 0);
    }

    public function test_a_missing_altcha_solution_is_refused(): void
    {
        $response = $this->postJson('/api/signups', self::VALID);

        $response->assertStatus(403)->assertExactJson([
            'error' => 'Anti-bot verification failed, please try again',
            'code' => 'captcha_failed',
        ]);
        $this->assertDatabaseCount('signups', 0);
    }

    public function test_an_empty_altcha_solution_is_refused(): void
    {
        $this->postJson('/api/signups', $this->payload(['altcha' => '']))
            ->assertStatus(403)
            ->assertJsonPath('code', 'captcha_failed');

        $this->assertDatabaseCount('signups', 0);
    }

    public function test_the_placeholder_secret_fails_closed(): void
    {
        // config.example.php ships CHANGE_ME publicly, so a challenge signed
        // with it is forgeable. The payload below IS validly signed with it —
        // only the placeholder check can reject this.
        config(['app.altcha_secret' => 'CHANGE_ME']);

        $this->postJson('/api/signups', $this->payload(['altcha' => $this->solved('CHANGE_ME')]))
            ->assertStatus(403)
            ->assertJsonPath('code', 'captcha_failed');

        $this->assertDatabaseCount('signups', 0);
    }

    public function test_an_empty_secret_fails_closed(): void
    {
        // Likewise validly signed — HMAC with an empty key still verifies.
        config(['app.altcha_secret' => '']);

        $this->postJson('/api/signups', $this->payload(['altcha' => $this->solved('')]))
            ->assertStatus(403)
            ->assertJsonPath('code', 'captcha_failed');

        $this->assertDatabaseCount('signups', 0);
    }

    public function test_a_non_shared_cache_store_fails_closed(): void
    {
        // ChallengeGuard IS the replay protection, and it is Cache::add(). The
        // array store is per-process and file is per-server, so either silently
        // reduces this endpoint to no replay protection at all.
        config(['cache.default' => 'array']);

        $this->postJson('/api/signups', $this->payload())
            ->assertStatus(403)
            ->assertJsonPath('code', 'captcha_failed');

        $this->assertDatabaseCount('signups', 0);
    }

    public function test_replaying_a_solved_challenge_is_refused(): void
    {
        Mail::fake();
        $payload = $this->payload();

        $this->postJson('/api/signups', $payload)->assertCreated();
        $this->postJson('/api/signups', $payload)
            ->assertStatus(403)
            ->assertJsonPath('code', 'captcha_failed');

        $this->assertDatabaseCount('signups', 1);
    }

    public function test_a_mail_failure_still_returns_201_with_the_row_stored(): void
    {
        // Losing a reservation because SMTP was down is the worst outcome here.
        Mail::shouldReceive('send')->once()->andThrow(new \RuntimeException('smtp down'));

        $this->postJson('/api/signups', $this->payload())
            ->assertCreated()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('signups', 1);
    }

    public function test_the_replay_guard_outlives_the_challenge(): void
    {
        Mail::fake();

        // Not a literal 600: the guard must outlive the challenge it protects,
        // so the TTL handed to it is asserted to be that very constant. Asserted
        // one level down at Cache::add(), because ChallengeGuard is final and so
        // cannot be mocked — the key prefix is its own.
        Cache::shouldReceive('add')
            ->once()
            ->with(Mockery::pattern('/^altcha:used:/'), true, AltchaController::TTL_SECONDS)
            ->andReturn(true);

        $this->postJson('/api/signups', $this->payload())->assertCreated();
    }
}
