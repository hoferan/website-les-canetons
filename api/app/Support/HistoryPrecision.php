<?php

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * How precisely a history entry's date is known: the year, the month or the day.
 */
enum HistoryPrecision: string
{
    // The date is stored truncated to this, so every "2019" entry is
    // 2019-01-01 and sorts with the others whatever day was typed.

    case Year = 'year';
    case Month = 'month';
    case Day = 'day';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case): string => $case->value, self::cases());
    }

    /** The `in:` rule body, e.g. `in:year,month,day`. */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::values());
    }

    public function truncate(CarbonImmutable $date): CarbonImmutable
    {
        return match ($this) {
            self::Year => $date->startOfYear(),
            self::Month => $date->startOfMonth(),
            self::Day => $date->startOfDay(),
        };
    }
}
