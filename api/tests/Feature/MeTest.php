<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_anonymous_caller_is_refused(): void
    {
        $this->getJson('/api/me')
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);
    }

    public function test_it_returns_identity_and_effective_permissions(): void
    {
        $section = Section::create(['name' => 'Clarinettes', 'sort_order' => 1]);
        $member = Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'section_id' => $section->id,
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);
        $role = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $role->syncPermissions([Permission::EventsManage, Permission::AttendanceViewAll]);
        $member->roles()->attach($role);

        // Re-fetch from the database rather than acting as the freshly-created
        // in-memory model: a model that never round-trips the DB default
        // serialises must_change_password as null instead of false, which
        // would pin a test-harness artifact rather than the real contract —
        // production always hydrates the authenticated user from the row.
        $member = Member::find($member->id);

        // App\Http\Middleware\EnforceAbsoluteSessionLifetime (appended to the
        // `api` group) reads auth.started_at off the request's session, so
        // every actingAs() call against /api/* now needs both: the Origin
        // header is what makes Sanctum's EnsureFrontendRequestsAreStateful
        // treat this as a stateful frontend request and actually attach a
        // session store to the request (fromFrontend() checks Origin/Referer);
        // withSession() alone only seeds the container's session singleton,
        // not this simulated request's own session. Mirrors
        // LoginTest::spaPostJson().
        $response = $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/me')->assertOk();

        $response->assertJson([
            'id' => $member->id,
            'username' => 'lea.keller',
            'firstName' => 'Léa',
            'lastName' => 'Keller',
        ]);

        // assertJson() above compares LOOSELY (PHPUnit array-subset semantics
        // under `==`), and in PHP `null == false` — so a boolean field that
        // regressed to null would still satisfy an `assertJson([... => false])`
        // expectation. Pinning both booleans here with assertSame() (identity
        // comparison) is what actually pins the contract; do not fold these
        // back into the assertJson() block above.
        $this->assertSame(true, $response->json('isPlayer'));
        $this->assertSame(false, $response->json('mustChangePassword'));

        $this->assertEqualsCanonicalizing(
            ['events.manage', 'attendance.view_all'],
            $response->json('permissions'),
        );
    }

    public function test_it_never_leaks_the_password_hash(): void
    {
        $member = Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);

        $body = $this->actingAs($member->fresh())
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/me')->assertOk()->json();

        $this->assertArrayNotHasKey('password', $body);
        $this->assertStringNotContainsString('argon2', json_encode($body));
    }

    public function test_a_member_with_no_register_is_not_a_player(): void
    {
        $member = Member::create([
            'first_name' => 'Marc',
            'last_name' => 'Rossier',
            'username' => 'marc.rossier',
            'password' => 'secret123',
        ]);

        $response = $this->actingAs($member->fresh())
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/me')->assertOk();

        // Not assertJson(): its loose (`==`) comparison would let 'isPlayer'
        // regress to null and still satisfy an expectation of false. assertSame()
        // is the identity comparison that actually pins the boolean contract.
        $this->assertSame(false, $response->json('isPlayer'));
    }

    public function test_the_response_is_never_cached(): void
    {
        // /api/me varies by identity; a shared proxy caching it would serve one
        // member's identity to another. Cache-Control is the only thing
        // stopping that, so its exact value is pinned here rather than
        // asserted with a loose substring match.
        $member = Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);

        $this->actingAs($member->fresh())
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/me')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
    }
}
