<?php

namespace App\Support;

/**
 * The icons a history entry may carry on the timeline.
 */
enum HistoryIcon: string
{
    // A closed set in code, like the permissions: the editor shows each
    // icon's name, and only a developer-defined key can have a name in both
    // catalogues. web/src/history/entry.ts mirrors it.

    case Flag = 'flag';
    case Star = 'star';
    case Music = 'music';
    case Trophy = 'trophy';
    case Users = 'users';
    case PartyPopper = 'party-popper';
    case MapPin = 'map-pin';
    case Heart = 'heart';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case): string => $case->value, self::cases());
    }

    /** The `in:` rule body. */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::values());
    }
}
