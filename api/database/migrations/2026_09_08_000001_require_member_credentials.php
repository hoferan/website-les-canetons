<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Every member has an account. `username` and `password` become NOT NULL.
 *
 * WHAT CHANGED, AND WHY IT IS A SIMPLIFICATION. The members table was built as
 * "a row is a person, not an account", with nullable credentials so that an
 * instructor on the public page, or a young member whose parent answers, needed
 * no login. That conflated two different populations:
 *
 *   - people the band TRACKS FOR EVENTS — they belong in attendance counts, so
 *     they are members, and they all get an account. A young member's parent
 *     uses that login on their behalf, so it is not even an unused one.
 *   - people the band merely DISPLAYS — instructors, honorary members,
 *     sponsors. They are CONTENT. They hold no permissions, appear in no
 *     attendance list, and have no business in an identity table.
 *
 * THIS DISSOLVES A LOCKOUT BUG RATHER THAN FIXING IT. Nullable credentials
 * meant a "ghost administrator" could hold members.manage while being unable to
 * log in, so this sequence passed every invariant and locked the band out: two
 * administrators, delete one, blank the other's username. The repair was
 * Adminer, on a host with no shell. AccessIntegrity gained a credential filter
 * and an assertMayRemoveCredentials() invariant to close it; with credentials
 * mandatory both become unreachable, and unreachable guards are this project's
 * recurring failure mode. They are deleted in the same change.
 *
 * BACKFILL. No server has a credential-less row today, but this must be safe
 * against one that does rather than failing mid-deploy and 503ing every
 * request. Such a row is given a placeholder username and an unusable random
 * password — it could not log in before this migration either, so nothing is
 * lost — and must_change_password, so an administrator issuing a real password
 * is the only way in.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->backfillCredentialLessRows();

        Schema::table('members', function (Blueprint $table): void {
            $table->string('username')->nullable(false)->change();
            $table->string('password')->nullable(false)->change();
        });
    }

    /**
     * Restores nullability. The backfilled placeholders are NOT reverted: there
     * is no record of which rows were empty, and inventing one would be worse
     * than leaving an account an administrator can see and delete.
     */
    public function down(): void
    {
        Schema::table('members', function (Blueprint $table): void {
            $table->string('username')->nullable()->change();
            $table->string('password')->nullable()->change();
        });
    }

    private function backfillCredentialLessRows(): void
    {
        $rows = DB::table('members')
            ->where(function ($query): void {
                $query->whereNull('username')->orWhereNull('password');
            })
            ->get(['id', 'username']);

        foreach ($rows as $row) {
            DB::table('members')->where('id', $row->id)->update([
                // Deterministic and obviously synthetic, so an administrator
                // reading the roster can tell this was generated rather than
                // chosen. Unique by construction, which the index requires.
                'username' => $row->username ?? 'member.'.$row->id,
                // Unusable: a random 64-character secret nobody has ever seen.
                // The row could not authenticate before this migration, and it
                // still cannot until somebody issues a real password.
                'password' => Hash::make(Str::random(64)),
                'must_change_password' => true,
                'updated_at' => now(),
            ]);
        }
    }
};
