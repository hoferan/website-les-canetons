<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `musician` to every member with a register who does not hold it yet.
 *
 * WHY THIS EXISTS AT ALL. 2026_09_29_000002 gave `musician` to everybody who
 * had a register on the day it ran. A member given one since, by POST /members
 * or by a PATCH, received the baseline role and nothing more, and could still
 * answer for events only because the register decided it. The API now checks
 * attendance.respond instead, so without this migration each of them would
 * silently stop being asked to answer, and drop off the chase list, on the
 * first request after the upload.
 *
 * WHY THAT IS NOT AN OVERRIDE. Until this code shipped, a register without
 * `musician` behaved exactly like a register with it, so nobody can have left
 * a player without the role on purpose. From here on that combination is a
 * real choice the committee can make, which is why this runs once and is not
 * repeated anywhere.
 *
 * insertOrIgnore against member_roles' primary key, as in 2026_09_29_000002:
 * safe to re-run, and a no-op wherever everybody already holds it. Plain
 * inserts, no ALTER, because this runs on the first request after an upload.
 */
return new class extends Migration
{
    public function up(): void
    {
        $musician = DB::table('roles')->where('key', 'musician')->value('id');

        // A database without the role is one where 2026_09_29_000002 has not
        // run, or where the committee deleted it. Neither is this migration's
        // problem to repair.
        if ($musician === null) {
            return;
        }

        DB::table('member_roles')->insertOrIgnoreUsing(
            ['member_id', 'role_id'],
            DB::table('members')->whereNotNull('section_id')->select('id', DB::raw((int) $musician.' as role_id')),
        );
    }

    /**
     * Nothing to undo. These grants cannot be told apart from the ones the
     * committee has made by hand since, so taking them back would take those
     * too.
     */
    public function down(): void {}
};
