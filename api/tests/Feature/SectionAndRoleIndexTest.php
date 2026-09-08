<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The read-only reference data the roster form needs: the register dropdown and
 * the role checklist.
 *
 * Both are gated on members.manage even though a register name is hardly a
 * secret. That is YAGNI, not secrecy: /members is the only consumer that
 * exists, and R2's public band page can widen the gate when it has a second one
 * to justify it.
 */
class SectionAndRoleIndexTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Every authenticated request in this suite needs BOTH the Origin header
     * and the auth.started_at stamp: the header makes Sanctum treat the request
     * as coming from a stateful frontend and attach a session store at all, and
     * the stamp satisfies EnforceAbsoluteSessionLifetime, which fails closed on
     * a session it cannot date. Mirrors PermissionMiddlewareTest.
     */
    private ?Member $actor = null;

    private function actingAsAdministrator(bool $withPermission = true): static
    {
        // Memoised: several tests below loop over both URLs and call this once
        // per URL, and creating the same username twice is a duplicate-key
        // error rather than a meaningful failure.
        $member = $this->actor ??= tap(Member::create([
            'first_name' => 'Dominique',
            'last_name' => 'Direction',
            'username' => 'dominique',
            'password' => 'secret123',
        ]), function (Member $member) use ($withPermission): void {
            if ($withPermission) {
                $member->roles()->attach(Role::where('key', 'direction')->sole());
            }
        });

        return $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp]);
    }

    public function test_the_registers_come_back_in_their_configured_order(): void
    {
        // The list the 2026_09_07_000001 migration seeds, in sort_order — NOT
        // in id order, and not alphabetical. The old front end hardcoded this
        // order in TSX, where it drifted from the table.
        $body = $this->actingAsAdministrator()->getJson('/api/sections')->assertOk()->json();

        $this->assertSame([
            'Batteurs',
            'Grosses-caisses',
            'Lyre',
            'Cloches',
            'Trompettes',
            'Trombones',
        ], array_column($body, 'name'));
        $this->assertSame([1, 2, 3, 4, 5, 6], array_column($body, 'sortOrder'));
        $this->assertArrayHasKey('id', $body[0]);
    }

    public function test_the_roles_come_back_with_what_they_grant(): void
    {
        // The permissions travel with the role because that is how the UI
        // answers "why does she have this?" — always "because she is in Team
        // Direction", never a per-member grant.
        $body = $this->actingAsAdministrator()->getJson('/api/roles')->assertOk()->json();

        $byKey = collect($body)->keyBy('key');

        $this->assertEqualsCanonicalizing(
            array_map(fn (Permission $p) => $p->value, Permission::cases()),
            $byKey['direction']['permissions'],
        );
        $this->assertSame(['registrations.view'], $byKey['committee']['permissions']);
    }

    public function test_a_role_carries_no_display_name_for_the_api_to_translate(): void
    {
        // The whole API is English; the only untranslated text is what a user
        // typed, and nobody typed "Team Direction" — a migration did. So the
        // UI resolves the name from `key` through fr.ts, and this pins the
        // response shape so a French field cannot creep back in.
        $body = $this->actingAsAdministrator()->getJson('/api/roles')->assertOk()->json();

        $this->assertSame(['id', 'key', 'permissions'], array_keys($body[0]));
    }

    public function test_neither_list_is_wrapped_in_a_data_envelope(): void
    {
        // JsonResource wraps collections in {"data": …} by default. /api/me and
        // /api/config return bare payloads, so wrapping here would give the API
        // two shapes for no reason — and every hand-written MSW handler would
        // have to imitate the wrapper.
        foreach (['/api/sections', '/api/roles'] as $url) {
            $body = $this->actingAsAdministrator()->getJson($url)->assertOk()->json();

            $this->assertArrayNotHasKey('data', $body, "{$url} must not be enveloped");
            $this->assertArrayHasKey(0, $body, "{$url} must be a bare array");
        }
    }

    public function test_neither_list_may_be_cached(): void
    {
        // Not an exact-match assertion: Symfony's Response::prepare() appends
        // ", private" whenever a session cookie is present. See
        // ConfigEndpointTest::test_it_is_not_cacheable for the full reasoning.
        foreach (['/api/sections', '/api/roles'] as $url) {
            $header = $this->actingAsAdministrator()->getJson($url)->assertOk()
                ->headers->get('Cache-Control');

            $this->assertNotNull($header);
            $this->assertStringContainsString('no-store', $header, "{$url} must not be cacheable");
        }
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        // Pairing auth:sanctum with permission: is what makes this a 401. With
        // only the permission gate, an anonymous caller would be told they are
        // forbidden rather than that they are nobody.
        foreach (['/api/sections', '/api/roles'] as $url) {
            $this->getJson($url)->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
        }
    }

    public function test_a_member_without_members_manage_gets_403(): void
    {
        foreach (['/api/sections', '/api/roles'] as $url) {
            $this->actingAsAdministrator(withPermission: false)
                ->getJson($url)
                ->assertStatus(403)
                ->assertJson(['code' => 'access_denied']);
        }
    }
}
