<?php

namespace Tests\Feature;

use App\Exceptions\AccessIntegrityViolation;
use App\Models\Member;
use App\Models\Role;
use App\Support\AccessIntegrity;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AccessIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private Role $admins;

    private Role $plain;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admins = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $this->admins->syncPermissions([Permission::MembersManage]);

        $this->plain = Role::create(['key' => 'committee', 'label_fr' => 'Comité']);
        $this->plain->syncPermissions([Permission::EventsManage]);
    }

    private function member(string $username, ?Role $role = null): Member
    {
        $member = Member::create([
            'first_name' => 'Demo',
            'last_name' => ucfirst($username),
            'username' => $username,
            'password' => 'secret123',
        ]);

        if ($role !== null) {
            $member->roles()->attach($role);
        }

        return $member;
    }

    public function test_the_last_administrator_cannot_be_deleted(): void
    {
        $only = $this->member('only', $this->admins);
        $other = $this->member('other', $this->admins);

        // Two exist, so removing one is fine.
        AccessIntegrity::assertMayDelete($only, $other);

        $other->delete();

        $this->expectException(AccessIntegrityViolation::class);
        AccessIntegrity::assertMayDelete($only, $only->fresh());
    }

    public function test_the_violation_carries_the_last_administrator_code(): void
    {
        $only = $this->member('only', $this->admins);

        try {
            AccessIntegrity::assertMayDelete($only, $only);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_remove_last_administrator', $e->code);
        }
    }

    public function test_nobody_may_delete_themselves(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('spare', $this->admins);

        try {
            AccessIntegrity::assertMayDelete($actor, $actor);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_delete_self', $e->code);
        }
    }

    public function test_a_member_without_the_permission_may_be_deleted_freely(): void
    {
        // The assertion IS that the call returns rather than throwing.
        // expectNotToPerformAssertions() says so honestly; assertTrue(true)
        // would only be silencing PHPUnit's risky-test warning.
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);
        $target = $this->member('target', $this->plain);

        AccessIntegrity::assertMayDelete($actor, $target);
    }

    public function test_the_last_administrator_cannot_be_demoted(): void
    {
        $actor = $this->member('actor', $this->admins);
        $only = $this->member('only', $this->admins);
        $actor->roles()->detach($this->admins);

        $this->expectException(AccessIntegrityViolation::class);
        AccessIntegrity::assertMayReplaceRoles($actor, $only, [$this->plain->id]);
    }

    public function test_nobody_may_strip_their_own_administration(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('spare', $this->admins);

        try {
            AccessIntegrity::assertMayReplaceRoles($actor, $actor, [$this->plain->id]);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_demote_self', $e->code);
        }
    }

    public function test_keeping_administration_while_adding_a_role_is_allowed(): void
    {
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);

        AccessIntegrity::assertMayReplaceRoles(
            $actor,
            $actor,
            [$this->admins->id, $this->plain->id],
        );
    }

    public function test_a_violation_renders_as_409_in_the_error_contract(): void
    {
        Route::middleware('api')->get(
            '/api/_test/violation',
            fn () => throw new AccessIntegrityViolation('cannot_delete_self', 'Cannot delete self'),
        );

        $this->getJson('/api/_test/violation')
            ->assertStatus(409)
            ->assertJson(['code' => 'cannot_delete_self']);
    }
}
