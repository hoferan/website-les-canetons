<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * content.manage reaches every role that already chooses the site's photos.
 *
 * A fresh database gets the token from Permission::cases() through the
 * direction seed. TEST, QA and PROD are not fresh, and their committee may have
 * made roles of its own that place photos, so the grant follows images.manage
 * rather than a role's key.
 */
class GrantContentManageTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_role_holding_images_manage_gains_content_manage(): void
    {
        $this->revokeEverywhere();
        $photos = Role::factory()->granting(Permission::ImagesManage)->create();
        $other = Role::factory()->granting(Permission::HistoryManage)->create();

        $this->migration()->up();

        $this->assertTrue($this->holds('direction'));
        $this->assertTrue($this->holds($photos->key));
        $this->assertFalse($this->holds($other->key));
    }

    public function test_it_is_safe_to_run_twice(): void
    {
        $this->migration()->up();
        $this->migration()->up();

        $this->assertSame(1, DB::table('role_permissions')
            ->where('role_id', $this->roleId('direction'))
            ->where('permission', Permission::ContentManage->value)
            ->count());
    }

    public function test_down_takes_content_manage_from_the_roles_holding_images_manage(): void
    {
        $before = DB::table('role_permissions')->where('role_id', $this->roleId('direction'))->count();

        $this->migration()->down();

        $this->assertFalse($this->holds('direction'));
        $this->assertSame($before - 1, DB::table('role_permissions')->where('role_id', $this->roleId('direction'))->count());
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_11_02_000001_grant_content_manage.php');
    }

    private function revokeEverywhere(): void
    {
        DB::table('role_permissions')->where('permission', Permission::ContentManage->value)->delete();
    }

    private function roleId(string $key): int
    {
        return (int) DB::table('roles')->where('key', $key)->value('id');
    }

    private function holds(string $key): bool
    {
        return DB::table('role_permissions')
            ->where('role_id', $this->roleId($key))
            ->where('permission', Permission::ContentManage->value)
            ->exists();
    }
}
