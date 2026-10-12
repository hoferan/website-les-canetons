<?php

use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `direction` roles.manage, the role editor's permission (#194).
 *
 * Same reasoning as 2026_10_02_000003. A fresh database seeds `direction` with
 * Permission::cases() and needs nothing from this file; TEST, QA and PROD
 * already have the role, and without the grant nobody could open the editor.
 * The token did not exist when the committee last looked at the role, so this
 * overrides no decision of theirs.
 *
 * insertOrIgnore against the (role_id, permission) primary key: safe to re-run,
 * and safe against a committee that has granted it themselves in the meantime.
 */
return new class extends Migration
{
    public function up(): void
    {
        $roleId = $this->direction();

        // A database without the role is one where 2026_09_07_000001 has not
        // run, or where the committee deleted it. Neither is this migration's
        // problem to repair.
        if ($roleId === null) {
            return;
        }

        DB::table('role_permissions')->insertOrIgnore([
            'role_id' => $roleId,
            'permission' => Permission::RolesManage->value,
        ]);
    }

    /** Removes only the one grant this migration made, never a role. */
    public function down(): void
    {
        $roleId = $this->direction();

        if ($roleId === null) {
            return;
        }

        DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission', Permission::RolesManage->value)
            ->delete();
    }

    private function direction(): ?int
    {
        $id = DB::table('roles')->where('key', 'direction')->value('id');

        return $id === null ? null : (int) $id;
    }
};
