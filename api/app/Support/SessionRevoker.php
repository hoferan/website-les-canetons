<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Ends every session belonging to a member, immediately.
 *
 * WHY THIS EXISTS. The `sessions` table has no foreign key to `members`, so
 * deleting a member leaves their session row untouched and they stay logged in
 * until it expires on its own. Without this call, hard-delete as an offboarding
 * mechanism is theatre — the thing the rebuild set out to fix.
 *
 * Call it after: deleting a member, changing their password, and changing their
 * roles. The last one matters as much as the first: a revoked permission that
 * only takes effect at the next login is a revoked permission the holder can
 * keep using all evening.
 *
 * Laravel's database session handler writes the authenticated id into
 * `user_id`; that column name comes from the framework, not from this
 * application's vocabulary, which is why it does not say `member_id`.
 */
final class SessionRevoker
{
    /** @return int the number of sessions ended */
    public static function forMember(int $memberId): int
    {
        return DB::table('sessions')->where('user_id', $memberId)->delete();
    }

    /**
     * Ends every session belonging to a member EXCEPT one.
     *
     * For a member changing their OWN password. The property §6 wants is that a
     * stolen session stops working the moment the password changes, and that
     * holds as long as every other session dies. Killing the current one as
     * well would log the actor out of the screen they are standing on — and the
     * forced-change screen is where every first login begins, so the literal
     * reading of §6 bounces every new account straight back to the login form.
     *
     * forMember() stays the right call for an administrator resetting SOMEBODY
     * ELSE's password, or deleting them: there, every session should die.
     *
     * Pass Session::getId(), read AFTER any regenerate() the request performs,
     * or this deletes the row it meant to keep.
     *
     * @return int the number of sessions ended
     */
    public static function forMemberExcept(int $memberId, string $keepSessionId): int
    {
        return DB::table('sessions')
            ->where('user_id', $memberId)
            ->where('id', '!=', $keepSessionId)
            ->delete();
    }
}
