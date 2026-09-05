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
}
