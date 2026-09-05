<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class PermissionMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['api', 'auth:sanctum', 'permission:events.manage'])
            ->get('/api/_test/guarded', fn () => response()->json(['ok' => true]));
    }

    private function memberWith(?Permission $permission): Member
    {
        $member = Member::create([
            'first_name' => 'Demo',
            'last_name' => 'Person',
            'username' => 'demo',
            'password' => 'secret123',
        ]);

        if ($permission !== null) {
            $role = Role::create(['key' => 'test', 'label_fr' => 'Test']);
            $role->syncPermissions([$permission]);
            $member->roles()->attach($role);
        }

        return $member;
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        $this->getJson('/api/_test/guarded')
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);
    }

    public function test_a_member_without_the_permission_gets_403(): void
    {
        // App\Http\Middleware\EnforceAbsoluteSessionLifetime (appended to the
        // `api` group) reads auth.started_at off the request's session, so
        // every actingAs() call needs both the Origin header (which makes
        // Sanctum treat this as a stateful frontend request and actually
        // attach a session store to the request) and the stamp itself — see
        // MeTest for the full explanation.
        $this->actingAs($this->memberWith(null))
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/_test/guarded')
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
    }

    public function test_a_member_with_the_permission_passes(): void
    {
        $this->actingAs($this->memberWith(Permission::EventsManage))
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/_test/guarded')
            ->assertOk()
            ->assertJson(['ok' => true]);
    }

    public function test_a_different_permission_does_not_open_the_route(): void
    {
        $this->actingAs($this->memberWith(Permission::MembersManage))
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/_test/guarded')
            ->assertStatus(403);
    }

    public function test_an_unknown_permission_name_is_a_loud_failure(): void
    {
        Route::middleware(['api', 'auth:sanctum', 'permission:events.mangle'])
            ->get('/api/_test/typo', fn () => response()->json(['ok' => true]));

        $this->withoutExceptionHandling();
        $this->expectException(\InvalidArgumentException::class);

        $this->actingAs($this->memberWith(Permission::EventsManage))
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/_test/typo');
    }
}
