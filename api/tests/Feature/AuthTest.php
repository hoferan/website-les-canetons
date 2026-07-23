<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Simulate a same-origin SPA request. Sanctum's statefulApi() only starts
     * a session (needed by login/logout) for requests it recognizes as coming
     * from a stateful frontend — i.e. carrying an Origin/Referer whose host is
     * in SANCTUM_STATEFUL_DOMAINS. `localhost` is a default stateful domain, so
     * this mirrors exactly how the real front-end (same origin, different path)
     * reaches these routes in production.
     *
     * @param array<string, mixed> $data
     */
    private function spaPostJson(string $uri, array $data = []): TestResponse
    {
        return $this->withHeaders(['Origin' => 'http://localhost'])->postJson($uri, $data);
    }

    public function test_login_with_valid_credentials_succeeds(): void
    {
        User::create([
            'username' => 'demo.user',
            'password' => 'secret123',
            'role' => 'user',
        ]);

        $response = $this->spaPostJson('/api/login', [
            'username' => 'demo.user',
            'password' => 'secret123',
        ]);

        $response->assertOk()->assertJson(['role' => 'user']);
        $this->assertAuthenticated();
    }

    public function test_login_with_wrong_password_fails(): void
    {
        User::create([
            'username' => 'demo.user',
            'password' => 'secret123',
            'role' => 'user',
        ]);

        $response = $this->spaPostJson('/api/login', [
            'username' => 'demo.user',
            'password' => 'wrong',
        ]);

        $response->assertStatus(401);
        $this->assertGuest();
    }

    public function test_login_with_unknown_username_fails(): void
    {
        $response = $this->spaPostJson('/api/login', [
            'username' => 'nobody',
            'password' => 'anything',
        ]);

        $response->assertStatus(401);
        $this->assertGuest();
    }

    public function test_current_user_endpoint_returns_role_when_authenticated(): void
    {
        $user = User::create([
            'username' => 'demo.admin',
            'password' => 'secret123',
            'role' => 'admin',
        ]);

        $response = $this->actingAs($user)->getJson('/api/user');

        $response->assertOk()->assertJson(['username' => 'demo.admin', 'role' => 'admin']);
    }

    public function test_current_user_endpoint_requires_auth(): void
    {
        $response = $this->getJson('/api/user');

        $response->assertStatus(401);
    }

    public function test_logout_succeeds_when_authenticated(): void
    {
        $user = User::create([
            'username' => 'demo.user',
            'password' => 'secret123',
            'role' => 'user',
        ]);

        $this->actingAs($user)->withHeaders(['Origin' => 'http://localhost'])
            ->postJson('/api/logout')
            ->assertOk()
            ->assertJson(['ok' => true]);
    }

    public function test_logout_requires_authentication(): void
    {
        $this->spaPostJson('/api/logout')->assertStatus(401);
    }
}
