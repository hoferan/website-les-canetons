<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Ends every session belonging to a member, immediately.
 *
 * The `sessions` table has no foreign key to `members`, so deleting a member
 * leaves their session row and they stay logged in until it expires. Without
 * this call, a hard delete does not offboard anybody.
 *
 * Call it after deleting a member, changing their password, and changing their
 * roles. The last matters as much as the first: a permission revoked only at
 * the next login is one the holder can keep using all evening.
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
     * Ends every session belonging to a member except one.
     *
     * For a member changing their own password. ADR 0010 wants a stolen
     * session to stop working the moment the password changes, which holds as
     * long as every other session dies. Killing the current one as well would
     * log the actor out of the screen they are on, and every first login
     * begins on the forced-change screen, so every new account would bounce
     * straight back to the login form.
     *
     * forMember() stays the right call for an administrator resetting somebody
     * else's password, or deleting them: there, every session should die.
     *
     * Pass Session::getId(), read after any regenerate() the request performs,
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
