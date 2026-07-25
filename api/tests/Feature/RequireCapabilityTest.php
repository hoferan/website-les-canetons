<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RequireCapabilityTest extends TestCase
{
    use RefreshDatabase;

    private function probe(string $capability): void
    {
        Route::middleware(['auth:sanctum', "capability:$capability"])
            ->get('/api/_capability_probe', fn () => response()->json(['ok' => true]));
    }

    public function test_a_role_holding_the_capability_passes(): void
    {
        $this->probe('respond');
        $user = User::create(['username' => 'u', 'password' => 'x', 'role' => 'user']);

        $this->actingAs($user)->getJson('/api/_capability_probe')
            ->assertOk()->assertJson(['ok' => true]);
    }

    public function test_a_role_lacking_the_capability_is_forbidden(): void
    {
        $this->probe('respond');
        // admin may manage events but must NOT respond — not a hierarchy.
        $admin = User::create(['username' => 'a', 'password' => 'x', 'role' => 'admin']);

        $this->actingAs($admin)->getJson('/api/_capability_probe')
            ->assertStatus(403)
            ->assertExactJson(['error' => 'Access denied', 'code' => 'access_denied']);
    }

    public function test_an_anonymous_caller_is_unauthenticated_not_forbidden(): void
    {
        $this->probe('respond');

        $this->getJson('/api/_capability_probe')
            ->assertStatus(401)
            ->assertExactJson(['error' => 'Not authenticated', 'code' => 'not_authenticated']);
    }
}
