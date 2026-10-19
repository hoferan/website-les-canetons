<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The role editor's API (#194): roles are data the committee shapes, gated on
 * roles.manage, and every write that can change who holds a permission goes
 * through AccessIntegrity.
 */
class RoleEditorTest extends TestCase
{
    use RefreshDatabase;

    private Member $actor;

    protected function setUp(): void
    {
        parent::setUp();

        // `direction`, seeded with every permission, roles.manage included.
        $this->actor = Member::factory()->named('Admin', 'Dominique', 'dominique')->administrator()->create();
    }

    private function withOnly(Permission ...$permissions): Member
    {
        return Member::factory()->withRole(Role::factory()->granting(...$permissions)->create())->create();
    }

    private function acting(?Member $as = null): static
    {
        return $this->actingAsMember(($as ?? $this->actor)->fresh());
    }

    // ------------------------------------------------------------- reading

    public function test_the_role_list_is_read_with_either_permission(): void
    {
        $this->acting($this->withOnly(Permission::RolesManage))->getJson('/api/v1/roles')->assertOk();
        $this->acting($this->withOnly(Permission::MembersManage))->getJson('/api/v1/roles')->assertOk();
        $this->acting($this->withOnly(Permission::EventsManage))->getJson('/api/v1/roles')->assertStatus(403);
    }

    public function test_one_role_names_who_holds_it_and_hands_out_its_tag(): void
    {
        // The delete confirmation names who loses what, so the read it opens
        // from carries the holders.
        $role = Role::factory()->granting(Permission::ImagesManage)->create();
        $holder = Member::factory()->named('Perrine', 'Player', 'perrine')->withRole($role)->create();

        $response = $this->acting()->getJson("/api/v1/roles/{$role->id}")->assertOk();

        $this->assertNotEmpty($response->headers->get('ETag'));
        $response->assertJsonPath('holders.0.id', $holder->id);
        $response->assertJsonPath('holders.0.firstName', 'Perrine');
        $response->assertJsonPath('permissions', ['images.manage']);
    }

    public function test_the_editor_is_closed_without_roles_manage(): void
    {
        // members.manage gives roles to people; it does not decide what a role
        // means.
        $role = Role::factory()->create();
        $administrator = $this->withOnly(Permission::MembersManage);

        $this->acting($administrator)->getJson("/api/v1/roles/{$role->id}")->assertStatus(403);
        $this->acting($administrator)->postJson('/api/v1/roles', ['labelFr' => 'X', 'permissions' => []])->assertStatus(403);
    }

    // ------------------------------------------------------------ creating

    public function test_a_role_is_created_with_its_names_and_what_it_grants(): void
    {
        $response = $this->acting()->postJson('/api/v1/roles', [
            'labelFr' => 'Photographes',
            'labelDe' => 'Fotografen',
            'permissions' => ['images.manage', 'history.manage'],
        ])->assertCreated();

        $role = Role::findOrFail($response->json('id'));
        $this->assertSame('Photographes', $role->label_fr);
        $this->assertSame('Fotografen', $role->label_de);
        $this->assertFalse($role->is_baseline);
        $this->assertEqualsCanonicalizing(
            [Permission::ImagesManage, Permission::HistoryManage],
            $role->permissions()->all(),
        );
        // The key is identity the committee never sees or types.
        $this->assertMatchesRegularExpression('/^custom-[a-z0-9]+$/', $role->key);
        $this->assertSame('role.created', AuditEntry::latest('id')->first()->action);
    }

    public function test_a_new_role_needs_a_french_name_not_taken_by_another(): void
    {
        Role::factory()->create(['key' => 'fixture-taken'])->forceFill(['label_fr' => 'Photographes'])->save();

        $this->acting()->postJson('/api/v1/roles', ['labelFr' => '  ', 'permissions' => []])
            ->assertStatus(400)->assertJsonPath('errors.0.field', 'labelFr');
        $this->acting()->postJson('/api/v1/roles', ['labelFr' => 'Photographes', 'permissions' => []])
            ->assertStatus(400)->assertJsonPath('errors.0.field', 'labelFr');
    }

    public function test_an_unknown_permission_is_refused(): void
    {
        $this->acting()->postJson('/api/v1/roles', ['labelFr' => 'Vide', 'permissions' => ['roles.mangle']])
            ->assertStatus(400)->assertJsonPath('errors.0.field', 'permissions.0');
    }

    // ------------------------------------------------------------ renaming

    public function test_a_role_is_renamed_under_its_tag(): void
    {
        $direction = Role::where('key', 'direction')->sole();

        $this->acting()->patchJson("/api/v1/roles/{$direction->id}", ['labelFr' => 'Direction', 'labelDe' => null])
            ->assertStatus(428);

        $this->acting()->withHeaders($this->ifMatch('role', $direction))
            ->patchJson("/api/v1/roles/{$direction->id}", ['labelFr' => 'Direction', 'labelDe' => null])
            ->assertOk()
            ->assertJsonPath('labelFr', 'Direction');

        // Its key, which the catalogue still translates, does not move.
        $this->assertSame('direction', $direction->fresh()->key);
    }

    public function test_the_baseline_role_is_not_renamed(): void
    {
        $baseline = Role::baseline();

        $this->acting()->withHeaders($this->ifMatch('role', $baseline))
            ->patchJson("/api/v1/roles/{$baseline->id}", ['labelFr' => 'Tout le monde'])
            ->assertStatus(409)->assertJson(['code' => 'baseline_role_is_fixed']);
    }

    // ---------------------------------------------- changing what it grants

    public function test_what_a_role_grants_is_replaced_whole(): void
    {
        $role = Role::factory()->granting(Permission::ImagesManage)->create();

        $this->acting()->withHeaders($this->ifMatch('role', $role))
            ->putJson("/api/v1/roles/{$role->id}/permissions", ['permissions' => ['history.manage']])
            ->assertOk()
            ->assertJsonPath('permissions', ['history.manage']);

        $this->assertSame('role.permissions_replaced', AuditEntry::latest('id')->first()->action);
    }

    public function test_a_grant_change_that_locks_the_band_out_is_refused(): void
    {
        // The actor is the only administrator, through `direction`.
        $direction = Role::where('key', 'direction')->sole();

        $this->acting()->withHeaders($this->ifMatch('role', $direction))
            ->putJson("/api/v1/roles/{$direction->id}/permissions", ['permissions' => ['events.manage']])
            ->assertStatus(409)->assertJson(['code' => 'cannot_remove_last_administrator']);

        $this->assertContains(Permission::MembersManage, $direction->permissions()->all());
    }

    public function test_the_last_role_administrator_is_kept_through_a_grant_change(): void
    {
        $direction = Role::where('key', 'direction')->sole();
        $grants = array_values(array_filter(
            array_map(fn (Permission $p) => $p->value, $direction->permissions()->all()),
            fn (string $value) => $value !== 'roles.manage',
        ));

        $this->acting()->withHeaders($this->ifMatch('role', $direction))
            ->putJson("/api/v1/roles/{$direction->id}/permissions", ['permissions' => $grants])
            ->assertStatus(409)->assertJson(['code' => 'cannot_remove_last_role_administrator']);
    }

    public function test_the_baselines_grants_are_fixed(): void
    {
        $baseline = Role::baseline();

        $this->acting()->withHeaders($this->ifMatch('role', $baseline))
            ->putJson("/api/v1/roles/{$baseline->id}/permissions", ['permissions' => ['events.view']])
            ->assertStatus(409)->assertJson(['code' => 'baseline_role_is_fixed']);
    }

    // ------------------------------------------------------------ deleting

    public function test_a_held_role_is_deleted_and_its_holders_lose_it(): void
    {
        $role = Role::factory()->granting(Permission::ImagesManage)->create();
        $holder = Member::factory()->withRole($role)->create();

        $this->acting()->withHeaders($this->ifMatch('role', $role))
            ->deleteJson("/api/v1/roles/{$role->id}")
            ->assertOk();

        $this->assertNull(Role::find($role->id));
        $this->assertFalse($holder->fresh()->hasPermission(Permission::ImagesManage));
        $this->assertSame('role.deleted', AuditEntry::latest('id')->first()->action);
    }

    public function test_a_role_given_to_somebody_since_the_read_is_not_deleted(): void
    {
        // The confirmation named who would lose the role. Somebody given it
        // since then was not named, so the delete answers 412.
        $role = Role::factory()->granting(Permission::ImagesManage)->create();
        $tag = $this->ifMatch('role', $role);

        Member::factory()->withRole($role)->create();

        $this->acting()->withHeaders($tag)->deleteJson("/api/v1/roles/{$role->id}")->assertStatus(412);
        $this->assertNotNull(Role::find($role->id));
    }

    public function test_deleting_the_only_administrators_role_is_refused(): void
    {
        $direction = Role::where('key', 'direction')->sole();

        $this->acting()->withHeaders($this->ifMatch('role', $direction))
            ->deleteJson("/api/v1/roles/{$direction->id}")
            ->assertStatus(409)->assertJson(['code' => 'cannot_remove_last_administrator']);

        $this->assertNotNull(Role::find($direction->id));
    }

    public function test_the_baseline_role_is_not_deleted(): void
    {
        $baseline = Role::baseline();

        $this->acting()->withHeaders($this->ifMatch('role', $baseline))
            ->deleteJson("/api/v1/roles/{$baseline->id}")
            ->assertStatus(409)->assertJson(['code' => 'baseline_role_is_fixed']);
    }

    // -------------------------------------------------------- end to end

    public function test_a_new_ability_takes_effect_without_a_deploy(): void
    {
        // Create a role, grant it a permission, assign it on the roster, and
        // the new holder can use it at once (#194).
        $member = Member::factory()->named('Perrine', 'Player', 'perrine')->create();
        $this->acting($member)->getJson('/api/v1/members')->assertStatus(403);

        $roleId = $this->acting()->postJson('/api/v1/roles', [
            'labelFr' => 'Secrétariat',
            'permissions' => ['members.manage'],
        ])->assertCreated()->json('id');

        $this->acting()->withHeaders($this->ifMatch('member', $member))
            ->putJson("/api/v1/members/{$member->id}/roles", ['roleIds' => [Role::baseline()->id, $roleId]])
            ->assertOk();

        $this->acting($member)->getJson('/api/v1/members')->assertOk();
    }
}
