<?php

namespace Tests\Feature;

use Tests\TestCase;

class AltchaEndpointTest extends TestCase
{
    public function test_it_issues_a_challenge(): void
    {
        config(['app.altcha_secret' => 'a-real-secret']);

        $this->getJson('/api/altcha')
            ->assertOk()
            ->assertJsonStructure(['algorithm', 'challenge', 'maxnumber', 'salt', 'signature'])
            ->assertJsonPath('algorithm', 'SHA-256')
            ->assertJsonPath('maxnumber', 50000);
    }

    public function test_it_fails_closed_when_the_secret_is_unset(): void
    {
        config(['app.altcha_secret' => '']);

        $this->getJson('/api/altcha')
            ->assertStatus(503)
            ->assertExactJson(['error' => 'Service unavailable', 'code' => 'service_unavailable']);
    }

    public function test_it_fails_closed_on_the_placeholder_secret(): void
    {
        // config.example.php ships CHANGE_ME publicly, so any challenge signed
        // with it is forgeable. A half-configured server must never issue one.
        config(['app.altcha_secret' => 'CHANGE_ME']);

        $this->getJson('/api/altcha')->assertStatus(503);
    }

    public function test_the_salt_carries_an_expiry(): void
    {
        config(['app.altcha_secret' => 'a-real-secret']);

        $salt = $this->getJson('/api/altcha')->json('salt');

        $this->assertMatchesRegularExpression('/\?expires=\d+$/', $salt);
    }
}
