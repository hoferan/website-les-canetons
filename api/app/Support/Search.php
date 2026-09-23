<?php

namespace App\Support;

/**
 * The free-text half of a list filter (#97): what `?q=` becomes in a query.
 *
 * A SUBSTRING MATCH, AND NOTHING CLEVERER. The roster is ~45 people and a
 * season ~30 events; what somebody types into the box is a fragment of a name
 * or a place, and `LIKE '%fragment%'` answers that exactly.
 *
 * CASE AND ACCENTS ARE THE COLLATION'S. The connection is `utf8mb4_unicode_ci`
 * (config/database.php), on production's 10.3 as on 10.11, so "helene" finds
 * "Hélène" without anything here folding either side. A column given a binary
 * collation would silently lose that; MemberSearchTest and EventSearchTest pin
 * it.
 *
 * THE WILDCARDS ARE ESCAPED, because the box is not a query language: a `%`
 * typed into it has to find a `%`, not the whole roster. `\` is MariaDB's
 * default LIKE escape character, so it is escaped first — escaping it last
 * would double the backslashes the other two replacements just added.
 */
final class Search
{
    /** The longest `q` a list accepts. Longer than any name or place, short enough to be one. */
    public const MAX_LENGTH = 100;

    /** The validation rules every `?q=` shares, so the two lists cannot drift. */
    public const RULES = ['nullable', 'string', 'max:'.self::MAX_LENGTH];

    /** `$term` as a LIKE pattern matching it anywhere, with its own wildcards made literal. */
    public static function contains(string $term): string
    {
        return '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term).'%';
    }
}
