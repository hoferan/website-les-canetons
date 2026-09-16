<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The read-only reference data the roster form needs: the register dropdown,
 * the committee-seat dropdown and the role checklist.
 *
 * All three are gated on members.manage even though a register name is hardly
 * a secret. That is YAGNI, not secrecy: /members is the only consumer that
 * exists. The public band and committee pages read the same rows, but they read
 * them through /api/v1/band and /api/v1/committee, which project a member down
 * to a name and a heading rather than handing out the reference tables.
 */
class ReferenceDataIndexTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Every read-only list the roster form renders a control from. Kept as one
     * constant so a fourth cannot be added without inheriting the envelope,
     * cache and authorization assertions the other three already make.
     */
    private const REFERENCE_LISTS = [
        '/api/v1/sections',
        '/api/v1/roles',
        '/api/v1/committee-functions',
    ];

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
        $factory = Member::factory()->named('Dominique', 'Direction');
        $member = $this->actor ??= ($withPermission ? $factory->administrator() : $factory)->create();

        return $this->actingAsMember($member);
    }

    public function test_the_registers_come_back_in_their_configured_order(): void
    {
        // The list the 2026_09_07_000001 migration seeds, in sort_order — NOT
        // in id order, and not alphabetical. The old front end hardcoded this
        // order in TSX, where it drifted from the table.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/sections')->assertOk()->json('data');

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

    public function test_the_committee_seats_come_back_in_rank_order(): void
    {
        // RANK ORDER IS THE ONLY REASON THIS TABLE EXISTS. A seat used to be
        // free text on the member row with nothing beside it saying which
        // outranks which, so the public page could only sort alphabetically and
        // printed the caissière above the présidente.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/committee-functions')
            ->assertOk()->json('data');

        $this->assertSame('Présidente', $body[0]['name']);
        $this->assertSame('Membre', $body[7]['name']);
        $this->assertSame(range(1, 8), array_column($body, 'sortOrder'));
    }

    public function test_the_roles_come_back_with_what_they_grant(): void
    {
        // The permissions travel with the role because that is how the UI
        // answers "why does she have this?" — always "because she is in Team
        // Direction", never a per-member grant.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/roles')->assertOk()->json('data');

        $byKey = collect($body)->keyBy('key');

        $this->assertEqualsCanonicalizing(
            array_map(fn (Permission $p) => $p->value, Permission::cases()),
            $byKey['direction']['permissions'],
        );
        $this->assertEqualsCanonicalizing(
            ['registrations.view', 'messages.view'],
            $byKey['committee']['permissions'],
        );
    }

    public function test_a_role_carries_no_display_name_for_the_api_to_translate(): void
    {
        // The whole API is English; the only untranslated text is what a user
        // typed, and nobody typed "Team Direction" — a migration did. So the
        // UI resolves the name from `key` through fr.ts, and this pins the
        // response shape so a French field cannot creep back in.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/roles')->assertOk()->json('data');

        $this->assertSame(['id', 'key', 'permissions'], array_keys($body[0]));
    }

    /**
     * REVERSED ON 2026-09-12, and the reversal is the point.
     *
     * This test used to assert the opposite — that these lists were bare arrays —
     * because /api/v1/me and /api/v1/config return bare payloads and a wrapper
     * here looked like two shapes for no reason. What that argument missed is
     * that `me` and `config` are not collections: the choice was never
     * "envelope or not", it was "do collections all look alike". They did not.
     *
     * Reference data is where it mattered most. These are the lists nobody
     * would ever page, so they are exactly the ones a pagination change is
     * tempted to skip — and a client that needs one code path for "read a list"
     * cannot have one if some endpoints opt out. See
     * App\Http\Middleware\PaginatesCollections.
     */
    public function test_every_list_comes_in_the_collection_envelope(): void
    {
        foreach (self::REFERENCE_LISTS as $url) {
            $body = $this->actingAsAdministrator()->getJson($url)->assertOk()->json();

            $this->assertArrayHasKey('data', $body, "{$url} must be enveloped");
            $this->assertArrayHasKey(0, $body['data'], "{$url}'s rows must be a bare array inside `data`");
            $this->assertSame(count($body['data']), $body['meta']['total'] ?? null, "{$url} miscounts itself");
        }
    }

    public function test_no_list_may_be_cached(): void
    {
        // Not an exact-match assertion: Symfony's Response::prepare() appends
        // ", private" whenever a session cookie is present. See
        // ConfigEndpointTest::test_it_is_not_cacheable for the full reasoning.
        foreach (self::REFERENCE_LISTS as $url) {
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
        foreach (self::REFERENCE_LISTS as $url) {
            $this->getJson($url)->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
        }
    }

    public function test_a_member_without_members_manage_gets_403(): void
    {
        foreach (self::REFERENCE_LISTS as $url) {
            $this->actingAsAdministrator(withPermission: false)
                ->getJson($url)
                ->assertStatus(403)
                ->assertJson(['code' => 'access_denied']);
        }
    }
}
