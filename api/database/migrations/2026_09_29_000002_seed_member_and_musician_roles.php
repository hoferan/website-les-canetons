<?php

use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The baseline and musician roles, and the assignments that keep every
 * account's abilities exactly what they are today.
 *
 * DATA ONLY, NO BEHAVIOUR CHANGE. Nothing checks events.view,
 * attendance.respond or account.manage yet; this ships ahead of the code that
 * requires them so every server carries the rows first (#191).
 *
 *   member    events.view, account.manage       every member
 *   musician  attendance.respond                every member with a register
 *
 * `musician` follows `section_id` here only because that is who answers events
 * today. From #192 the roster form pre-ticks it, and a register never grants
 * anything by itself.
 *
 * IDEMPOTENT: roles are created when missing and their grants seeded only then
 * (ADR 0014: a role's permissions become the committee's once seeded), the
 * baseline marker is structural and always set, and the assignments are
 * insertOrIgnore against member_roles' primary key. Plain inserts, no ALTER,
 * because this runs on the first request after an upload.
 */
return new class extends Migration
{
    public function up(): void
    {
        $member = $this->role('member', [Permission::EventsView, Permission::AccountManage]);
        $musician = $this->role('musician', [Permission::AttendanceRespond]);

        DB::table('roles')->where('id', $member)->update(['is_baseline' => true]);

        DB::table('member_roles')->insertOrIgnoreUsing(
            ['member_id', 'role_id'],
            DB::table('members')->select('id', DB::raw((int) $member.' as role_id')),
        );

        DB::table('member_roles')->insertOrIgnoreUsing(
            ['member_id', 'role_id'],
            DB::table('members')->whereNotNull('section_id')->select('id', DB::raw((int) $musician.' as role_id')),
        );
    }

    /**
     * Removes only the two roles, and only when nothing but this migration's own
     * assignments attach to them. Detaches those assignments first.
     */
    public function down(): void
    {
        foreach (['member', 'musician'] as $key) {
            $id = DB::table('roles')->where('key', $key)->value('id');

            if ($id === null) {
                continue;
            }

            DB::table('member_roles')->where('role_id', $id)->delete();
            DB::table('role_permissions')->where('role_id', $id)->delete();
            DB::table('roles')->where('id', $id)->delete();
        }
    }

    /** @param  array<int, Permission>  $permissions */
    private function role(string $key, array $permissions): int
    {
        $existing = DB::table('roles')->where('key', $key)->value('id');

        if ($existing !== null) {
            return (int) $existing;
        }

        $now = now();
        $id = DB::table('roles')->insertGetId([
            'key' => $key,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('role_permissions')->insert(array_map(
            fn (Permission $permission): array => ['role_id' => $id, 'permission' => $permission->value],
            $permissions,
        ));

        return $id;
    }
};
