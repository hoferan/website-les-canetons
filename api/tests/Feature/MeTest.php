<?php

namespace Tests\Feature;

use App\Models\CommitteeFunction;
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
        $this->getJson('/api/v1/me')
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);
    }

    public function test_it_returns_identity_and_effective_permissions(): void
    {
        $section = Section::create(['name' => 'Clarinettes', 'sort_order' => 1]);
        $member = Member::factory()->named('Léa', 'Keller', 'lea.keller')->inSection($section)->musician()->create();
        $role = Role::factory()->create();
        $role->syncPermissions([Permission::EventsManage, Permission::AttendanceViewAll]);
        $member->roles()->attach($role);

        // Re-fetched so the DB default is hydrated: the in-memory model
        // serialises must_change_password as null, and production always
        // loads the authenticated user from the row.
        $member = Member::find($member->id);

        $response = $this->actingAsMember($member)
            ->getJson('/api/v1/me')->assertOk();

        $response->assertJson([
            'id' => $member->id,
            'username' => 'lea.keller',
            'firstName' => 'Léa',
            'lastName' => 'Keller',
        ]);

        // ADR 0014: no single `role` key decides access. assertJson() ignores
        // extra keys, so this is the assertion that keeps one out.
        $this->assertArrayNotHasKey('role', $response->json());

        // assertJson() compares loosely, and `null == false`, so the boolean
        // is pinned with assertSame(). Do not fold it into assertJson().
        $this->assertSame(false, $response->json('mustChangePassword'));

        // The role made here, plus the baseline and musician the factory gave.
        $this->assertEqualsCanonicalizing(
            ['events.manage', 'attendance.view_all', 'events.view', 'account.manage', 'attendance.respond'],
            $response->json('permissions'),
        );
    }

    public function test_it_says_where_the_member_sits_in_the_band(): void
    {
        $section = Section::create(['name' => 'Clarinettes', 'sort_order' => 1]);
        $seat = CommitteeFunction::where('name', 'Présidente')->firstOrFail();
        $member = Member::factory()->named('Léa', 'Keller', 'lea.keller')->inSection($section)->create();
        $member->committeeFunction()->associate($seat)->save();
        $member->roles()->attach(Role::where('key', 'direction')->firstOrFail());

        $response = $this->actingAsMember($member->fresh())
            ->getJson('/api/v1/me')->assertOk();

        $this->assertSame('Clarinettes', $response->json('sectionName'));
        $this->assertSame('Présidente', $response->json('committeeFunctionName'));
        $this->assertSame(['direction', 'member'], array_column($response->json('roles'), 'key'));
    }

    public function test_a_role_carries_the_names_the_committee_typed(): void
    {
        // A role made in the editor has no catalogue entry, so its key alone
        // would put `custom-01h…` on the account page.
        $role = Role::factory()->create();
        $role->forceFill(['label_fr' => 'Photographes', 'label_de' => 'Fotografen'])->save();
        $member = Member::factory()->named('Léa', 'Keller', 'lea.keller')->withRole($role)->create();

        $roles = collect($this->actingAsMember($member->fresh())->getJson('/api/v1/me')->json('roles'));

        $this->assertSame(
            ['key' => $role->key, 'labelFr' => 'Photographes', 'labelDe' => 'Fotografen'],
            $roles->firstWhere('key', $role->key),
        );
    }

    public function test_a_member_with_no_place_gets_nulls_and_only_the_baseline_role(): void
    {
        $member = Member::factory()->named('Marc', 'Rossier', 'marc.rossier')->create();

        $response = $this->actingAsMember($member->fresh())
            ->getJson('/api/v1/me')->assertOk();

        // assertSame, not assertJson: a missing key and a null read the same
        // under assertJson's loose comparison, and the client relies on the
        // keys being present.
        $body = $response->json();
        $this->assertArrayHasKey('sectionName', $body);
        $this->assertNull($body['sectionName']);
        $this->assertArrayHasKey('committeeFunctionName', $body);
        $this->assertNull($body['committeeFunctionName']);
        $this->assertSame([['key' => 'member', 'labelFr' => null, 'labelDe' => null]], $body['roles']);
    }

    public function test_it_never_leaks_the_password_hash(): void
    {
        $member = Member::factory()->named('Léa', 'Keller', 'lea.keller')->create();

        $body = $this->actingAsMember($member->fresh())
            ->getJson('/api/v1/me')->assertOk()->json();

        $this->assertArrayNotHasKey('password', $body);
        $this->assertStringNotContainsString('argon2', json_encode($body));
    }

    public function test_answering_for_events_is_read_from_permissions_alone(): void
    {
        // The SPA shows the answer buttons on can('attendance.respond'), so
        // `permissions` has to agree with what the API lets through, whatever
        // the register says. No second field such as `isPlayer` may say the
        // same thing, since two answers to one question can disagree.
        $registerOnly = Member::factory()->named('Marc', 'Rossier', 'marc.rossier')->inSection('Cloches')->create();
        $unplaced = Member::factory()->named('Nora', 'Bulliard', 'nora.bulliard')->musician()->create();

        $inRegister = $this->actingAsMember($registerOnly->fresh())->getJson('/api/v1/me')->json();
        $withRole = $this->actingAsMember($unplaced->fresh())->getJson('/api/v1/me')->json();

        $this->assertNotContains('attendance.respond', $inRegister['permissions']);
        $this->assertContains('attendance.respond', $withRole['permissions']);
        $this->assertArrayNotHasKey('isPlayer', $inRegister);
        $this->assertArrayNotHasKey('isPlayer', $withRole);
    }

    public function test_the_response_is_never_cached(): void
    {
        // /api/v1/me varies by identity, and a shared proxy caching it would
        // serve one member's identity to another. Cache-Control is the only
        // thing stopping that, so its exact value is pinned.
        $member = Member::factory()->named('Léa', 'Keller', 'lea.keller')->create();

        $this->actingAsMember($member->fresh())
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
    }
}
