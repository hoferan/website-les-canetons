<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\Exceptions\InvalidFormatException;

/**
 * Where the database's UTC and the band's wall clock meet.
 *
 * `config('app.timezone')` is `'UTC'`: every timestamp this application stores
 * or compares is UTC. A rehearsal is at 10:00 in Fribourg wherever the page is
 * read from, so Europe/Zurich is a property of the band, not of the current
 * user. That is why `ZONE` is a class constant rather than a config key or an
 * `.env` value: a server whose `.env` disagreed would silently shift a whole
 * season. Every caller composing or displaying an event time goes through
 * here, so one place knows the offset.
 */
final class BandTime
{
    /** The band's timezone. The class docblock says why it is a constant. */
    public const ZONE = 'Europe/Zurich';

    /**
     * Compose a `Y-m-d` date and an `H:i` wall-clock time, as typed for a
     * Fribourg event, into the UTC instant the database stores.
     *
     * Returns a `CarbonImmutable` rather than a plain `Carbon`, so a caller
     * mutating the result in place cannot change a value somebody else holds.
     *
     * A local time that does not exist (the spring-forward gap) or is
     * ambiguous (the autumn-back overlap) is not rejected: PHP shifts a
     * nonexistent time forward by the gap, and resolves an ambiguous time to
     * its post-transition offset. Not guarded against, because no band event
     * is scheduled in the 02:00-03:00 window this affects.
     *
     * The non-nullable return relies on Carbon's factory defaulting to strict
     * mode (`vendor/nesbot/carbon/src/Carbon/Factory.php`), which makes
     * `createFromFormat` throw on unparseable input instead of returning
     * `false`/`null`. Nothing in this app overrides that default. Every caller
     * is a Form Request that has already validated the format, so there is no
     * second check here.
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
     * Midnight in Fribourg, as a UTC instant: the boundary the upcoming/past
     * split uses.
     *
     * Not `CarbonImmutable::today()`, which takes midnight in
     * `config('app.timezone')` (UTC). At 00:30 in Fribourg it is still 22:30
     * UTC the previous day, so a UTC "start of today" would drop this
     * evening's event out of the planning two hours early.
     *
     * `->utc()` is load-bearing. Laravel's query grammar formats a bound
     * DateTimeInterface as `Y-m-d H:i:s` in the value's own timezone, so a
     * Zurich midnight would reach the database as a Zurich literal compared
     * against a UTC column, moving the boundary two hours late in summer and
     * one in winter. An event between midnight and 02:00 Fribourg time would
     * then drop out of the planning on the day it happens, at carnival the
     * hours the band is out playing. `startOfDay()` has to run in the band's
     * zone, which is why the conversion comes second.
     */
    public static function startOfToday(): CarbonImmutable
    {
        return CarbonImmutable::now(self::ZONE)->startOfDay()->utc();
    }
}
