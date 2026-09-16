<?php

use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `direction` both message permissions and `committee` the read.
 *
 * WHY THIS EXISTS AT ALL. 2026_09_07_000001 seeds `direction` with
 * Permission::cases(), so a fresh database needs nothing from this file. It
 * also returns early for a role that already exists — deliberately, because a
 * role's permissions become the committee's business once seeded and a re-sync
 * would undo their edits on the next deploy. TEST, QA and PROD all have both
 * roles already, so without this migration nobody holds either token and every
 * screen in the committee inbox answers 403 to everybody, with the code
 * perfectly correct.
 *
 * WHY THAT IS NOT AN OVERRIDE. Neither token existed when the committee last
 * looked at these roles, so nobody can have deliberately removed one. Adding a
 * permission the enum had no case for is not reversing a decision. Same
 * reasoning as 2026_09_10_000003.
 *
 * insertOrIgnore against the (role_id, permission) primary key: safe to re-run,
 * and safe against a committee that has granted it themselves in the meantime.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->grant('direction', Permission::MessagesView);
        $this->grant('direction', Permission::MessagesManage);
        $this->grant('committee', Permission::MessagesView);
    }

    /**
     * Removes only the three grants, never a role.
     *
     * Same reasoning as 2026_09_07_000001's own down(): this migration created
     * three rows, and those are the only rows it may take back.
     */
    public function down(): void
    {
        $this->revoke('direction', Permission::MessagesView);
        $this->revoke('direction', Permission::MessagesManage);
        $this->revoke('committee', Permission::MessagesView);
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
