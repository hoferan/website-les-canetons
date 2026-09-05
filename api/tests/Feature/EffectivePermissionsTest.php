<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EffectivePermissionsTest extends TestCase
{
    use RefreshDatabase;

    private function member(string $username = 'demo'): Member
    {
        return Member::create([
            'first_name' => 'Demo',
            'last_name' => 'Person',
            'username' => $username,
            'password' => 'secret123',
        ]);
    }

    public function test_a_member_with_no_roles_has_no_permissions(): void
    {
        $this->assertTrue($this->member()->permissions()->isEmpty());
    }

    public function test_permissions_arrive_through_roles(): void
    {
        $member = $this->member();
        $role = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $role->syncPermissions([Permission::EventsManage, Permission::AttendanceViewAll]);
        $member->roles()->attach($role);

        $this->assertTrue($member->hasPermission(Permission::EventsManage));
        $this->assertTrue($member->hasPermission(Permission::AttendanceViewAll));
        $this->assertFalse($member->hasPermission(Permission::MembersManage));
    }

    public function test_permissions_from_several_roles_are_unioned_without_duplicates(): void
    {
        $member = $this->member();

        $direction = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $direction->syncPermissions([Permission::EventsManage, Permission::AttendanceViewAll]);

        $committee = Role::create(['key' => 'committee', 'label_fr' => 'Comité']);
        $committee->syncPermissions([Permission::EventsManage, Permission::MembersManage]);

        $member->roles()->attach([$direction->id, $committee->id]);

        $this->assertEqualsCanonicalizing(
            ['events.manage', 'attendance.view_all', 'members.manage'],
            $member->permissions()->map(fn (Permission $p) => $p->value)->all(),
        );
    }

    public function test_a_stored_permission_no_longer_in_the_enum_is_ignored(): void
    {
        // A permission removed from the enum must not crash authorization for
        // every member who still carries the stale row.
        $member = $this->member();
        $role = Role::create(['key' => 'legacy', 'label_fr' => 'Legacy']);
        $member->roles()->attach($role);

        DB::table('role_permissions')->insert([
            'role_id' => $role->id,
            'permission' => 'view_summary',
        ]);

        $this->assertTrue($member->permissions()->isEmpty());
    }

    public function test_revoking_a_role_revokes_its_permissions(): void
    {
        $member = $this->member();
        $role = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $role->syncPermissions([Permission::MembersManage]);
        $member->roles()->attach($role);

        $this->assertTrue($member->hasPermission(Permission::MembersManage));

        $member->roles()->detach($role);

        $this->assertFalse($member->fresh()->hasPermission(Permission::MembersManage));
    }
}
