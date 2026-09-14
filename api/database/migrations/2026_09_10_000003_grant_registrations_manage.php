<?php

use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `direction` the new `registrations.manage` permission.
 *
 * WHY A SEPARATE PERMISSION FROM `registrations.view`. Reading the guest list
 * and editing somebody's personal data or cancelling their booking are
 * different acts. `committee` holds `registrations.view` as its ONLY
 * permission — that role exists so somebody can look at the guest list — and
 * widening the meaning of the token it holds would silently hand it the power
 * to delete bookings.
 *
 * WHY THIS RE-SYNCS WHERE 2026_09_07_000001 REFUSES TO. That migration stops
 * dead if a role already exists, on the grounds that its permissions are the
 * committee's business now. The distinction here is that
 * `registrations.manage` did not exist when they last looked: nobody can have
 * deliberately removed a permission the enum had no case for, so adding it is
 * not overriding a decision. insertOrIgnore against the (role_id, permission)
 * primary key makes it safe to re-run and safe against a committee that has
 * since granted it themselves.
 *
 * Deliberately NOT granted to `committee`. If the band wants that, it is an
 * Adminer edit today and a role editor's job later (decision B3).
 */
return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('roles')->where('key', 'direction')->value('id');

        // A database where `direction` does not exist is one where
        // 2026_09_07_000001 has not run or where the committee deleted the
        // role. Neither is this migration's problem to repair.
        if ($roleId === null) {
            return;
        }

        DB::table('role_permissions')->insertOrIgnore([
            'role_id' => $roleId,
            'permission' => Permission::RegistrationsManage->value,
        ]);
    }

    /**
     * Removes only the grant, never the role. Same reasoning as
     * 2026_09_07_000001's own down(): this migration created one row and that
     * is the only row it may take back.
     */
    public function down(): void
    {
        $roleId = DB::table('roles')->where('key', 'direction')->value('id');

        if ($roleId === null) {
            return;
        }

        DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission', Permission::RegistrationsManage->value)
            ->delete();
    }
};
