<?php

use App\Support\EffectivePermissions;
use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Creates the FIRST person who can administer members, and only ever that.
 *
 * WHY THIS EXISTS. /members is gated on members.manage, and permissions arrive
 * only through roles — so on a fresh database nobody can grant anybody
 * anything. On a normal host you would run an artisan command once. This host
 * has no shell: the FTP account is chrooted to the web root and remote MySQL is
 * blocked, so the migration path is the only thing that reaches a deployed
 * database at all.
 *
 * THE GUARD IS "IS ADMINISTRATION HELD", not "are there any members". A
 * database full of players with nobody holding members.manage is exactly the
 * state this must repair.
 *
 * The password is read from that server's own .env and the account is created
 * with must_change_password, because a password that has been typed into a file
 * is not a secret worth keeping.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (EffectivePermissions::memberIdsWith(Permission::MembersManage)->isNotEmpty()) {
            return;
        }

        $username = config('bootstrap.admin.username');
        $password = config('bootstrap.admin.password');

        if (blank($username) || blank($password)) {
            // Not an error. A local stack, a test run, or a server that has
            // already been bootstrapped by hand all land here legitimately.
            return;
        }

        // Refusing beats creating: this account can lock the whole band out of
        // its own administration, so it does not get a five-character password
        // because somebody was in a hurry with a .env file.
        if (mb_strlen((string) $password) < 12) {
            throw new RuntimeException(
                'BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters. '.
                'Set a longer one in this server\'s _api/.env and redeploy.',
            );
        }

        $roleId = DB::table('roles')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'roles.id')
            ->where('role_permissions.permission', Permission::MembersManage->value)
            ->orderBy('roles.id')
            ->value('roles.id');

        if ($roleId === null) {
            throw new RuntimeException(
                'No role grants members.manage, so a first administrator cannot be '.
                'created. The 2026_09_07_000001 migration seeds one — run migrations in order.',
            );
        }

        DB::transaction(function () use ($username, $password, $roleId): void {
            $now = now();

            $memberId = DB::table('members')->insertGetId([
                'first_name' => config('bootstrap.admin.first_name'),
                'last_name' => config('bootstrap.admin.last_name'),
                'username' => $username,
                'password' => Hash::make($password),
                'must_change_password' => true,
                // No register: this account administers, and a member with no
                // section_id is not answerable for events, so it never shows up
                // in an attendance count as an unanswered row.
                'section_id' => null,
                // Publication is opt-in per person (the members migration
                // defaults it false); a bootstrap account has consented to
                // nothing.
                'public_visible' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('member_roles')->insert([
                'member_id' => $memberId,
                'role_id' => $roleId,
            ]);
        });
    }

    /**
     * Deliberately empty. Rolling this back would delete the only account that
     * can administer members, which is the state it exists to prevent.
     */
    public function down(): void {}
};
