<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\Exceptions\InvalidFormatException;

/**
 * Where the database's UTC and the band's wall clock meet.
 *
 * `config('app.timezone')` is `'UTC'`, and stays that way — every timestamp
 * this application stores or compares is UTC. But a rehearsal is at 10:00 in
 * Fribourg whether the page is read from Fribourg or from Sydney: Europe/Zurich
 * is not "the current user's timezone", it is a property of the band. That is
 * why `ZONE` is a class constant rather than a config key or an `.env` value —
 * a server whose `.env` disagreed would silently shift a whole season, and
 * there is no legitimate case for two servers of this application disagreeing
 * about where Fribourg is. Every caller composing or displaying an event time
 * goes through here, so there is exactly one place that knows the offset, and
 * exactly one place a future daylight-saving rule change would have to touch.
 */
final class BandTime
{
    /**
     * The band's timezone, deliberately hard-coded — see the class docblock
     * for why this is a constant and not configuration.
     */
    public const ZONE = 'Europe/Zurich';

    /**
     * Compose a `Y-m-d` date and an `H:i` wall-clock time, as typed for a
     * Fribourg event, into the UTC instant the database stores.
     *
     * Returns a `CarbonImmutable` rather than a plain `Carbon`: a caller that
     * mutates a returned "now" or "composed instant" in place, expecting the
     * original to be unaffected, is a bug that a mutable date would not catch.
     *
     * A local time that does not exist (the spring-forward gap) or is
     * ambiguous (the autumn-back overlap) is not rejected: PHP silently
     * shifts a nonexistent time forward by the gap, and resolves an
     * ambiguous time to its post-transition offset. Verified 2026-09-09, not
     * guarded against: no band event is ever scheduled in the 02:00-03:00
     * window this affects.
     *
     * The non-nullable return depends on an ambient default, not an explicit
     * contract: Carbon's factory defaults to strict mode
     * (`vendor/nesbot/carbon/src/Carbon/Factory.php`), which is what makes
     * `createFromFormat` throw on unparseable input instead of returning
     * `false`/`null`. Nothing in this app overrides that default. Relied on
     * deliberately — every caller is a Form Request that has already
     * validated the format, so a second, defensive check here would only be
     * dead code — but it is the framework's default doing the work, not a
     * guarantee this class makes on its own.
     *
     * @throws InvalidFormatException if $date or $time does not match its
     *                                expected format — reachable only if a caller skips Form Request
     *                                validation.
     */
    public static function compose(string $date, string $time): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat(
            'Y-m-d H:i',
            "{$date} {$time}",
            self::ZONE,
        );
    }

    /**
     * Midnight in Fribourg, as a UTC instant — the boundary the
     * upcoming/past split uses.
     *
     * Deliberately not `CarbonImmutable::today()`, which would take midnight
     * in `config('app.timezone')` (UTC). At 00:30 in Fribourg it is still
     * 22:30 UTC the previous day, so a UTC-based "start of today" would drop
     * this evening's event out of the planning two hours early.
     *
     * `->utc()` IS LOAD-BEARING, and its absence was a real defect until
     * 2026-09-12. The instant was always right; what was wrong is how it
     * reached the database. Laravel's query grammar formats a bound
     * DateTimeInterface as `Y-m-d H:i:s` IN THE VALUE'S OWN TIMEZONE, so a
     * Zurich-based midnight arrived as the literal '2026-09-12 00:00:00' and
     * was compared against a column holding UTC — moving the boundary two
     * hours late in summer and one in winter. Measured with `toRawSql()`, not
     * inferred. The effect was that an event between midnight and 02:00
     * Fribourg time dropped out of the planning on the day it happened, which
     * for a Guggenmusik at carnival is precisely the hours they are out
     * playing. Converting here keeps the instant and fixes every caller;
     * `startOfDay()` still has to run in the band's zone, which is why the
     * conversion is second rather than first.
     */
    public static function startOfToday(): CarbonImmutable
    {
        return CarbonImmutable::now(self::ZONE)->startOfDay()->utc();
    }
}
