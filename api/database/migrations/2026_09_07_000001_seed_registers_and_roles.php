<?php

use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The registers and the two roles, as DATA rather than a seeder.
 *
 * WHY A MIGRATION. The shared host has no shell — FTP plus the token-gated
 * POST /api/migrate is the entire remote surface — so `artisan db:seed` can
 * never be run against a server. The migration path is the only mechanism that
 * reaches a deployed database, and it already runs itself on the first request
 * after a deploy (App\Http\Middleware\RunPendingMigrations).
 *
 * IDEMPOTENT AND NON-DESTRUCTIVE, in the same style as every migration in this
 * project: it inserts what is missing and touches nothing that exists. A role's
 * permissions are seeded ONLY when the role itself is new, because the
 * committee can edit them (design §3) and a migration that re-synced them
 * would silently undo that on the next deploy.
 */
return new class extends Migration
{
    /**
     * The band's own order, recovered from the pre-rebuild /canetons page.
     * "Direction" appeared there as a seventh entry and is deliberately absent:
     * it is not a register anyone plays in. A musical director is a member with
     * a committee_title, or with instructor_of_section_id pointing at the
     * register they teach.
     */
    private const REGISTERS = [
        'Batteurs',
        'Grosses-caisses',
        'Lyre',
        'Cloches',
        'Trompettes',
        'Trombones',
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::REGISTERS as $index => $name) {
            // insertOrIgnore against the unique index on sections.name: a
            // register a committee has renamed is left alone rather than
            // resurrected under its old name on the next deploy.
            DB::table('sections')->insertOrIgnore([
                'name' => $name,
                'sort_order' => $index + 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $this->role('direction', 'Team Direction', Permission::cases());
        $this->role('committee', 'Comité', [Permission::RegistrationsView]);
    }

    /**
     * `down()` deliberately removes only the roles and registers nothing has
     * attached itself to. Dropping a register that members point at, or a role
     * members hold, would cascade into the roster — and this migration's whole
     * purpose is to be safe to run against a live database.
     */
    public function down(): void
    {
        foreach (['direction', 'committee'] as $key) {
            $roleId = DB::table('roles')->where('key', $key)->value('id');

            if ($roleId !== null && ! DB::table('member_roles')->where('role_id', $roleId)->exists()) {
                DB::table('role_permissions')->where('role_id', $roleId)->delete();
                DB::table('roles')->where('id', $roleId)->delete();
            }
        }

        foreach (self::REGISTERS as $name) {
            $sectionId = DB::table('sections')->where('name', $name)->value('id');

            if ($sectionId === null) {
                continue;
            }

            $inUse = DB::table('members')->where('section_id', $sectionId)->exists()
                || DB::table('members')->where('instructor_of_section_id', $sectionId)->exists();

            if (! $inUse) {
                DB::table('sections')->where('id', $sectionId)->delete();
            }
        }
    }

    /** @param  array<int, Permission>  $permissions */
    private function role(string $key, string $labelFr, array $permissions): void
    {
        $existing = DB::table('roles')->where('key', $key)->value('id');

        if ($existing !== null) {
            // The role is already here, so its permissions are the committee's
            // business now. Do not re-sync them.
            return;
        }

        $now = now();
        $roleId = DB::table('roles')->insertGetId([
            'key' => $key,
            'label_fr' => $labelFr,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('role_permissions')->insert(
            collect($permissions)
                ->map(fn (Permission $permission): array => [
                    'role_id' => $roleId,
                    'permission' => $permission->value,
                ])
                ->all(),
        );
    }
};
