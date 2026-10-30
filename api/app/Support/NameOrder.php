<?php

namespace App\Support;

use Collator;
use Illuminate\Support\Str;

/**
 * Orders names the way a French reader looks them up.
 *
 * A byte comparison sorts "de Weck" and "Égger" after "Zbinden", so a
 * volunteer at the till scanning for them in order would not find them.
 * `Collator` does it properly, but `ext-intl` is not a dependency and the
 * host may lack it, so without it the names are compared as lower-case ASCII,
 * which gets the same answer for every name a guest list holds.
 *
 * Numbers compare by value either way, so "Table 2" comes before "Table 10".
 */
final class NameOrder
{
    private static ?Collator $collator = null;

    public static function compare(string $a, string $b): int
    {
        if (class_exists(Collator::class)) {
            if (self::$collator === null) {
                self::$collator = new Collator('fr_CH');
                self::$collator->setStrength(Collator::PRIMARY);
                self::$collator->setAttribute(Collator::NUMERIC_COLLATION, Collator::ON);
            }

            return (int) self::$collator->compare($a, $b);
        }

        return strnatcmp(Str::lower(Str::ascii($a)), Str::lower(Str::ascii($b)));
    }
}
