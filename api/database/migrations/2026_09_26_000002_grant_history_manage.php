<?php

use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `direction` history.manage.
 *
 * WHY THIS EXISTS AT ALL. 2026_09_07_000001 seeds `direction` with
 * Permission::cases(), so a fresh database needs nothing from this file. It
 * also returns early for a role that already exists, deliberately, because a
 * role's permissions become the committee's business once seeded. TEST, QA and
 * PROD all have the role already, so without this migration nobody holds the
 * token and every history write answers 403, with the code perfectly correct.
 *
 * WHY THAT IS NOT AN OVERRIDE. The token did not exist when the committee last
 * looked at the role, so nobody can have deliberately removed it. Same
 * reasoning as 2026_09_15_000002.
 *
 * insertOrIgnore against the (role_id, permission) primary key: safe to re-run,
 * and safe against a committee that has granted it themselves in the meantime.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->grant('direction', Permission::HistoryManage);
    }

    /** Removes only the one grant this migration made, never a role. */
    public function down(): void
    {
        $this->revoke('direction', Permission::HistoryManage);
    }

    private function grant(string $key, Permission $permission): void
    {
        $roleId = DB::table('roles')->where('key', $key)->value('id');

        // A database without the role is one where 2026_09_07_000001 has not
        // run, or where the committee deleted it. Neither is this migration's
        // problem to repair.
        if ($roleId === null) {
            return;
        }

        DB::table('role_permissions')->insertOrIgnore([
            'role_id' => $roleId,
            'permission' => $permission->value,
        ]);
    }

    private function revoke(string $key, Permission $permission): void
    {
        $roleId = DB::table('roles')->where('key', $key)->value('id');

        if ($roleId === null) {
            return;
        }

        DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission', $permission->value)
            ->delete();
    }
};
