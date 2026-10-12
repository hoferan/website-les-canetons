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
            ->get('/api/v1/_test/guarded', fn () => response()->json(['ok' => true]));
    }

    private function memberWith(?Permission $permission): Member
    {
        $member = Member::factory()->named('Demo', 'Person', 'demo')->create();

        if ($permission !== null) {
            $role = Role::factory()->create();
            $role->syncPermissions([$permission]);
            $member->roles()->attach($role);
        }

        return $member;
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        $this->getJson('/api/v1/_test/guarded')
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
        $this->actingAsMember($this->memberWith(null))
            ->getJson('/api/v1/_test/guarded')
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
    }

    public function test_a_member_with_the_permission_passes(): void
    {
        $this->actingAsMember($this->memberWith(Permission::EventsManage))
            ->getJson('/api/v1/_test/guarded')
            ->assertOk()
            ->assertJson(['ok' => true]);
    }

    public function test_a_different_permission_does_not_open_the_route(): void
    {
        $this->actingAsMember($this->memberWith(Permission::MembersManage))
            ->getJson('/api/v1/_test/guarded')
            ->assertStatus(403);
    }

    public function test_a_route_may_accept_any_of_several_permissions(): void
    {
        // GET /roles is read by the roster form (members.manage) and by the
        // role editor (roles.manage), and somebody may hold either alone.
        Route::middleware(['api', 'auth:sanctum', 'permission:members.manage,roles.manage'])
            ->get('/api/v1/_test/either', fn () => response()->json(['ok' => true]));

        $this->actingAsMember($this->memberWith(Permission::MembersManage))
            ->getJson('/api/v1/_test/either')->assertOk();
        $this->actingAsMember(Member::factory()->create()->fresh())->getJson('/api/v1/_test/either')
            ->assertStatus(403);

        $rolesOnly = Member::factory()->create();
        $role = Role::factory()->create();
        $role->syncPermissions([Permission::RolesManage]);
        $rolesOnly->roles()->attach($role);

        $this->actingAsMember($rolesOnly->fresh())->getJson('/api/v1/_test/either')->assertOk();
    }

    public function test_an_unknown_name_in_a_list_is_a_loud_failure_too(): void
    {
        // Not skipped because another name in the list matched: a typo that
        // only fails when nobody holds the first permission is a typo found
        // in production.
        Route::middleware(['api', 'auth:sanctum', 'permission:events.manage,roles.mangle'])
            ->get('/api/v1/_test/typo-list', fn () => response()->json(['ok' => true]));

        $this->withoutExceptionHandling();
        $this->expectException(\InvalidArgumentException::class);

        $this->actingAsMember($this->memberWith(Permission::EventsManage))
            ->getJson('/api/v1/_test/typo-list');
    }

    /**
     * The routes that need a session and nothing more, as `METHOD uri =>
     * why`. Everything else under auth:sanctum carries `permission:`, so a new
     * route without a gate fails here instead of silently meaning "any
     * logged-in account". The reasons are the ones api/routes/api.php gives.
     *
     * @var array<string, string>
     */
    private const SESSION_ONLY = [
        'POST api/v1/logout' => 'logging out has to work for whoever is logged in',
        'GET|HEAD api/v1/me' => 'it is how a client learns what the caller holds',
        'GET|HEAD api/v1/inbox' => 'filters each source by its own permission instead of refusing',
        'GET|HEAD api/v1/inbox/summary' => 'the nav count, filtered the same way as the inbox',
    ];

    public function test_every_authenticated_route_names_a_permission(): void
    {
        $ungated = [];
        $authenticated = 0;
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $middleware = $route->gatherMiddleware();
            if (! in_array('auth:sanctum', $middleware, true) || str_contains($route->uri(), '_test/')) {
                continue;
            }
            $authenticated++;

            $gated = array_filter($middleware, fn ($name): bool => is_string($name) && str_starts_with($name, 'permission:'));
            $name = implode('|', $route->methods()).' '.$route->uri();
            if ($gated === [] && ! array_key_exists($name, self::SESSION_ONLY)) {
                $ungated[] = $name;
            }
        }

        // A floor, so a renamed middleware alias cannot pass by matching nothing.
        $this->assertGreaterThan(50, $authenticated, 'Found almost no auth:sanctum routes; the scan is broken.');
        $this->assertSame([], $ungated,
            "These routes need only a session. Gate each with permission:, or add it to SESSION_ONLY with the reason:\n"
            .implode("\n", $ungated));
    }

    public function test_every_session_only_exemption_still_exists(): void
    {
        // A stale entry is an exemption waiting for the next route to reuse
        // its URI.
        $routes = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $routes[] = implode('|', $route->methods()).' '.$route->uri();
        }

        $this->assertSame([], array_values(array_diff(array_keys(self::SESSION_ONLY), $routes)));
    }

    public function test_an_unknown_permission_name_is_a_loud_failure(): void
    {
        Route::middleware(['api', 'auth:sanctum', 'permission:events.mangle'])
            ->get('/api/v1/_test/typo', fn () => response()->json(['ok' => true]));

        $this->withoutExceptionHandling();
        $this->expectException(\InvalidArgumentException::class);

        $this->actingAsMember($this->memberWith(Permission::EventsManage))
            ->getJson('/api/v1/_test/typo');
    }
}
