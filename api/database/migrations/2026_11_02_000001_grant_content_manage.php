<?php

use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives content.manage to every role that holds images.manage.
 *
 * A fresh database needs nothing from this file: the direction seed grants
 * Permission::cases(). TEST, QA and PROD already have their roles, so without
 * this nobody would hold the token and every content block write would
 * answer 403.
 *
 * It follows images.manage rather than the `direction` key because the
 * committee may have made roles of its own that place photos, and the people
 * who choose what the site shows are the ones who choose what it says. The
 * token did not exist when anyone last looked at a role, so this overrides
 * nobody's decision (same reasoning as 2026_10_02_000003).
 *
 * insertOrIgnore against the (role_id, permission) primary key: safe to re-run.
 */
return new class extends Migration
{
    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', Permission::ImagesManage->value)
            ->pluck('role_id');

        DB::table('role_permissions')->insertOrIgnore($roleIds->map(fn ($roleId): array => [
            'role_id' => $roleId,
            'permission' => Permission::ContentManage->value,
        ])->all());
    }

    /** Takes the token back from the roles that place photos, and nothing else. */
    public function down(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', Permission::ImagesManage->value)
            ->pluck('role_id');

        DB::table('role_permissions')
            ->whereIn('role_id', $roleIds)
            ->where('permission', Permission::ContentManage->value)
            ->delete();
    }
};
