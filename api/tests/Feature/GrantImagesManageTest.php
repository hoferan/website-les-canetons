<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * images.manage exists as data on a database that already had the roles.
 *
 * Same shape as GrantHistoryManageTest: a fresh database gets the token from
 * Permission::cases(), and TEST, QA and PROD are not fresh databases.
 */
class GrantImagesManageTest extends TestCase
{
    use RefreshDatabase;

    public function test_direction_may_manage_the_images(): void
    {
        $this->assertTrue($this->roleHas());
    }

    public function test_the_grant_reaches_a_role_that_already_existed(): void
    {
        $this->revoke();

        $this->migration()->up();

        $this->assertTrue($this->roleHas());
    }

    public function test_the_grant_is_safe_to_run_twice(): void
    {
        $this->migration()->up();
        $this->migration()->up();

        $this->assertSame(1, $this->grantCount());
    }

    public function test_a_database_without_the_role_is_left_alone(): void
    {
        Role::query()->where('key', 'direction')->delete();

        $this->migration()->up();

        $this->assertSame(0, $this->grantCount());
    }

    public function test_down_removes_only_that_grant(): void
    {
        $before = DB::table('role_permissions')->where('role_id', $this->roleId())->count();

        $this->migration()->down();

        $this->assertFalse($this->roleHas());
        $this->assertSame($before - 1, DB::table('role_permissions')->where('role_id', $this->roleId())->count());
        $this->assertNotNull(DB::table('roles')->where('key', 'direction')->first());
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_10_02_000003_grant_images_manage.php');
    }

    private function revoke(): void
    {
        DB::table('role_permissions')
            ->where('role_id', $this->roleId())
            ->where('permission', Permission::ImagesManage->value)
            ->delete();
    }

    private function roleId(): int
    {
        return (int) DB::table('roles')->where('key', 'direction')->value('id');
    }

    private function grantCount(): int
    {
        return DB::table('role_permissions')
            ->where('permission', Permission::ImagesManage->value)
            ->count();
    }

    private function roleHas(): bool
    {
        return DB::table('role_permissions')
            ->where('role_id', $this->roleId())
            ->where('permission', Permission::ImagesManage->value)
            ->exists();
    }
}
