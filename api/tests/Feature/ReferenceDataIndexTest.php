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
 * All three are gated on members.manage (/roles also on roles.manage), though a
 * register name is no secret: the roster form is the only consumer. The public
 * band and committee pages read the same rows through /api/v1/band and
 * /api/v1/committee, which project a member down to a name and a heading.
 */
class ReferenceDataIndexTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Every read-only list the roster form renders a control from, in one
     * constant so a new one inherits the envelope, cache and authorization
     * assertions.
     */
    private const REFERENCE_LISTS = [
        '/api/v1/sections',
        '/api/v1/roles',
        '/api/v1/committee-functions',
    ];

    private ?Member $actor = null;

    private function actingAsAdministrator(bool $withPermission = true): static
    {
        // Memoised: several tests call this once per URL, and creating the
        // same username twice is a duplicate-key error.
        $factory = Member::factory()->named('Dominique', 'Direction');
        $member = $this->actor ??= ($withPermission ? $factory->administrator() : $factory)->create();

        return $this->actingAsMember($member);
    }

    public function test_the_registers_come_back_in_their_configured_order(): void
    {
        // The seeded list in sort_order, which is neither id order nor
        // alphabetical.
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
        // Rank order is why this table exists: alphabetically the caissière
        // would sort above the présidente.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/committee-functions')
            ->assertOk()->json('data');

        $this->assertSame('Présidente', $body[0]['name']);
        $this->assertSame('Membre', $body[7]['name']);
        $this->assertSame(range(1, 8), array_column($body, 'sortOrder'));
    }

    public function test_the_roles_come_back_with_what_they_grant(): void
    {
        // The permissions travel with the role so the UI can answer "why does
        // she have this?": always through a role, never a per-member grant.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/roles')->assertOk()->json('data');

        $byKey = collect($body)->keyBy('key');

        $organising = array_filter(
            Permission::cases(),
            fn (Permission $p): bool => ! in_array($p, [
                Permission::EventsView,
                Permission::AttendanceRespond,
                Permission::AccountManage,
            ], true),
        );

        $this->assertEqualsCanonicalizing(
            array_map(fn (Permission $p) => $p->value, $organising),
            $byKey['direction']['permissions'],
        );
        $this->assertEqualsCanonicalizing(
            ['registrations.view', 'messages.view'],
            $byKey['committee']['permissions'],
        );
    }

    public function test_a_role_carries_only_the_names_the_committee_typed(): void
    {
        // The API is English; the only untranslated text is what a user typed.
        // A seeded role was named by a migration, so it sends no name and the
        // UI resolves it from `key` (ADR 0026). labelFr and labelDe carry what
        // the role editor stores (#194); this pins the shape so no other name
        // field creeps in.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/roles')->assertOk()->json('data');

        $this->assertSame(['id', 'key', 'labelFr', 'labelDe', 'isBaseline', 'permissions'], array_keys($body[0]));
        $this->assertNull($body[0]['labelFr']);
        $this->assertNull($body[0]['labelDe']);
    }

    public function test_exactly_the_baseline_role_says_so(): void
    {
        // A client needs this to keep the baseline in every PUT of a member's
        // roles, which refuses a list without it. The only other way to find it
        // is by key, and nothing may decide anything from a role's name.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/roles')->assertOk()->json('data');

        $this->assertSame(
            [Role::baseline()->id],
            array_column(array_filter($body, fn (array $role): bool => $role['isBaseline'] === true), 'id'),
        );
    }

    /**
     * Every collection looks alike, the small ones included. `me` and `config`
     * are objects and stay bare. Nobody would page these lists, which is why
     * they are pinned: a client gets one code path for reading a list only if
     * no endpoint opts out. See App\Http\Middleware\PaginatesCollections.
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
        // ConfigEndpointTest::test_it_is_not_cacheable.
        foreach (self::REFERENCE_LISTS as $url) {
            $header = $this->actingAsAdministrator()->getJson($url)->assertOk()
                ->headers->get('Cache-Control');

            $this->assertNotNull($header);
            $this->assertStringContainsString('no-store', $header, "{$url} must not be cacheable");
        }
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        // Pairing auth:sanctum with permission: makes this a 401. With only the
        // permission gate an anonymous caller would get 403.
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
