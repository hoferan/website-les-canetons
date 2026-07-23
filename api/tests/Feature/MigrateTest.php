<?php

namespace Tests\Feature;

use Tests\TestCase;

class MigrateTest extends TestCase
{
    public function test_migrate_requires_a_valid_token(): void
    {
        $response = $this->postJson('/api/migrate', ['token' => 'wrong-token']);

        $response->assertStatus(403);
    }

    public function test_migrate_requires_a_token_at_all(): void
    {
        $response = $this->postJson('/api/migrate', []);

        $response->assertStatus(403);
    }

    public function test_migrate_runs_with_a_valid_token(): void
    {
        config(['app.migrate_token' => 'test-token-123']);

        $response = $this->postJson('/api/migrate', ['token' => 'test-token-123']);

        $response->assertOk()->assertJsonStructure(['ok', 'output']);
    }
}
