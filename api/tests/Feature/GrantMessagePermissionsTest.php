<?php

namespace Tests\Feature;

use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The permissions exist as data on a database that already had the roles.
 *
 * WHY THIS TEST IS THE IMPORTANT ONE. 2026_09_07_000001 seeds `direction` with
 * Permission::cases(), so a FRESH database picks both new tokens up for free
 * and every test here would pass without the grant migration existing at all.
 * TEST is not a fresh database: both roles are already there, that migration
 * returns early for a role that exists, and the result is a perfectly correct
 * feature that 403s for every single person. The third test below is the one
 * that fails when the grant migration is missing.
 */
class GrantMessagePermissionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_direction_may_read_and_manage_messages(): void
    {
        $this->assertTrue($this->roleHas('direction', Permission::MessagesView));
        $this->assertTrue($this->roleHas('direction', Permission::MessagesManage));
    }

    public function test_committee_may_read_messages_but_not_clear_them(): void
    {
        $this->assertTrue($this->roleHas('committee', Permission::MessagesView));
        $this->assertFalse($this->roleHas('committee', Permission::MessagesManage));
    }

    public function test_the_grant_reaches_roles_that_already_existed(): void
    {
        // Reproduces TEST: the roles are here, the permissions are not.
        $this->revoke('direction', Permission::MessagesView);
        $this->revoke('direction', Permission::MessagesManage);
        $this->revoke('committee', Permission::MessagesView);

        $this->runGrantMigration();

        $this->assertTrue($this->roleHas('direction', Permission::MessagesView));
        $this->assertTrue($this->roleHas('direction', Permission::MessagesManage));
        $this->assertTrue($this->roleHas('committee', Permission::MessagesView));
    }

    public function test_the_grant_is_safe_to_run_twice(): void
    {
        $this->runGrantMigration();
        $this->runGrantMigration();

        $this->assertSame(1, $this->grantCount('direction', Permission::MessagesView));
    }

    private function runGrantMigration(): void
    {
        (require database_path('migrations/2026_09_15_000002_grant_message_permissions.php'))->up();
    }

    private function roleId(string $key): int
    {
        return (int) DB::table('roles')->where('key', $key)->value('id');
    }

    private function roleHas(string $key, Permission $permission): bool
    {
        return $this->grantCount($key, $permission) > 0;
    }

    private function grantCount(string $key, Permission $permission): int
    {
        return DB::table('role_permissions')
            ->where('role_id', $this->roleId($key))
            ->where('permission', $permission->value)
            ->count();
    }

    private function revoke(string $key, Permission $permission): void
    {
        DB::table('role_permissions')
            ->where('role_id', $this->roleId($key))
            ->where('permission', $permission->value)
            ->delete();
    }
}
