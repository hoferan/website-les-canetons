<?php

namespace Tests\Unit;

use App\Support\BandTime;
use PHPUnit\Framework\TestCase;

class BandTimeTest extends TestCase
{
    public function test_it_composes_a_date_and_a_wall_clock_time_into_utc(): void
    {
        // 5 September 2026 is CEST, UTC+2. Ten in the morning in Fribourg is
        // eight in the morning UTC, and that is what the column must hold.
        $composed = BandTime::compose('2026-09-05', '10:00');

        $this->assertSame('2026-09-05 08:00:00', $composed->utc()->format('Y-m-d H:i:s'));
    }

    public function test_it_honours_the_winter_offset(): void
    {
        // 5 December is CET, UTC+1. The SAME wall-clock time is a DIFFERENT
        // instant, which is the entire reason this class exists rather than a
        // hard-coded "+2 hours" somewhere.
        $composed = BandTime::compose('2026-12-05', '10:00');

        $this->assertSame('2026-12-05 09:00:00', $composed->utc()->format('Y-m-d H:i:s'));
    }

    public function test_the_composed_instant_reads_back_as_the_wall_clock_time(): void
    {
        // The round trip a member actually experiences: what was typed is what
        // the planning shows.
        $composed = BandTime::compose('2026-12-05', '10:00');

        $this->assertSame('10:00', $composed->setTimezone(BandTime::ZONE)->format('H:i'));
    }

    public function test_the_start_of_today_is_midnight_in_fribourg_not_in_utc(): void
    {
        // Used by the upcoming/past split. At 00:30 Fribourg time it is still
        // 22:30 UTC the previous day, so a UTC-based "start of today" would
        // drop this evening's event out of the planning two hours early.
        $startOfToday = BandTime::startOfToday();

        $this->assertSame('00:00:00', $startOfToday->setTimezone(BandTime::ZONE)->format('H:i:s'));
    }

    /**
     * AND IT HAS TO ARRIVE AT THE DATABASE AS UTC, which is a different claim
     * from the one above and was false until 2026-09-12.
     *
     * Laravel's query grammar formats a bound DateTimeInterface in the value's
     * own timezone, so a Zurich-based midnight was compared against a UTC
     * column as the literal wall-clock string and the boundary sat two hours
     * late — dropping an event between midnight and 02:00 Fribourg time out of
     * the planning on the day it happened. The instant was never wrong; only
     * its serialisation was, which is why the test above stayed green
     * throughout.
     */
    public function test_the_start_of_today_is_carried_in_utc_so_a_query_binds_it_correctly(): void
    {
        $startOfToday = BandTime::startOfToday();

        $this->assertSame('UTC', $startOfToday->getTimezone()->getName());
        // What a query literally sends. Dropping `->utc()` from startOfToday()
        // fails on this line and on nothing else in this file.
        $this->assertSame(
            $startOfToday->clone()->setTimezone('UTC')->format('Y-m-d H:i:s'),
            $startOfToday->format('Y-m-d H:i:s'),
        );
    }
}
