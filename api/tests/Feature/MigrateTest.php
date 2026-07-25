<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * POST /api/migrate is gated by a shared secret carried in the X-Migrate-Token
 * REQUEST HEADER — never a body or query parameter. See MigrateController for
 * why; the tests below pin both halves of that: the header works, and the two
 * parameter spellings do not.
 */
class MigrateTest extends TestCase
{
    private const TOKEN = 'test-token-123';

    public function test_migrate_requires_a_valid_token(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate', [], ['X-Migrate-Token' => 'wrong-token']);

        $response->assertStatus(403);
    }

    public function test_migrate_requires_a_token_at_all(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate', []);

        $response->assertStatus(403);
    }

    /**
     * An unconfigured MIGRATE_TOKEN must refuse everything, not accept anything:
     * without the empty-token guard, hash_equals('', '') — or any caller's token
     * against a null config — would open the endpoint on a server whose
     * config.php is missing the key.
     */
    public function test_migrate_refuses_when_no_token_is_configured(): void
    {
        config(['app.migrate_token' => null]);

        $this->postJson('/api/migrate', [], ['X-Migrate-Token' => ''])->assertStatus(403);
        $this->postJson('/api/migrate', [], ['X-Migrate-Token' => 'anything'])->assertStatus(403);
    }

    public function test_migrate_accepts_the_token_in_a_header(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate', [], ['X-Migrate-Token' => self::TOKEN]);

        $response->assertOk()
            ->assertJsonStructure(['ok', 'output'])
            ->assertJsonPath('ok', true);
    }

    /**
     * The whole point of the header: a secret in the query string is written to
     * Apache's access log on every environment, so ?token=… must not work even
     * though it is the correct secret.
     */
    public function test_migrate_rejects_a_token_passed_as_a_query_parameter(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate?token='.self::TOKEN);

        $response->assertStatus(403);
    }

    /**
     * Replaces this file's original test_migrate_runs_with_a_valid_token, which
     * asserted the body-parameter contract. Only one spelling may work, so the
     * old assertion is inverted rather than dropped — that keeps the retired
     * spelling pinned shut instead of merely untested.
     */
    public function test_migrate_rejects_a_token_passed_as_a_body_parameter(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate', ['token' => self::TOKEN]);

        $response->assertStatus(403);
    }
}
