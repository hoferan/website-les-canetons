<?php

namespace Tests\Feature;

use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * history.manage exists as data on a database that already had the roles.
 *
 * The third test is the one that fails without the grant migration: a fresh
 * database gets the token from Permission::cases() for free, and TEST is not a
 * fresh database.
 */
class GrantHistoryManageTest extends TestCase
{
    use RefreshDatabase;

    public function test_direction_may_manage_the_history(): void
    {
        $this->assertTrue($this->roleHas('direction', Permission::HistoryManage));
    }

    public function test_committee_may_not(): void
    {
        $this->assertFalse($this->roleHas('committee', Permission::HistoryManage));
    }

    public function test_the_grant_reaches_a_role_that_already_existed(): void
    {
        DB::table('role_permissions')
            ->where('role_id', $this->roleId('direction'))
            ->where('permission', Permission::HistoryManage->value)
            ->delete();

        $this->runGrantMigration();

        $this->assertTrue($this->roleHas('direction', Permission::HistoryManage));
    }

    public function test_the_grant_is_safe_to_run_twice(): void
    {
        $this->runGrantMigration();
        $this->runGrantMigration();

        $this->assertSame(1, DB::table('role_permissions')
            ->where('role_id', $this->roleId('direction'))
            ->where('permission', Permission::HistoryManage->value)
            ->count());
    }

    private function runGrantMigration(): void
    {
        (require database_path('migrations/2026_09_26_000002_grant_history_manage.php'))->up();
    }

    private function roleId(string $key): int
    {
        return (int) DB::table('roles')->where('key', $key)->value('id');
    }

    private function roleHas(string $key, Permission $permission): bool
    {
        return DB::table('role_permissions')
            ->where('role_id', $this->roleId($key))
            ->where('permission', $permission->value)
            ->exists();
    }
}
