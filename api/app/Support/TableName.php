<?php

namespace App\Support;

/**
 * What makes two bookings sit at the same table: the same name, trimmed.
 *
 * Nothing else is normalised. Two unrelated families may both call their table
 * "Müller", so guessing that "müller" or "Tisch Müller" mean the same table
 * would seat strangers together. Never group tables in SQL either: the
 * column's collation compares case-insensitively and would merge them.
 */
final class TableName
{
    public static function key(?string $typed): ?string
    {
        $name = trim($typed ?? '');

        return $name === '' ? null : $name;
    }
}
