<?php

namespace App\Support;

/**
 * The colours an event tag may take: a closed set of names, not a free hex
 * value.
 */
enum TagColour: string
{
    // Only the docblock above is published. The SPA pairs each name with a
    // tint and an ink checked together for 4.5:1 contrast at the chip's 12px
    // (#107); a hex the committee typed could not be. The pairs live in
    // web/src/styles.css, so a name added here needs its pair there.

    case Violet = 'violet';
    case Teal = 'teal';
    case Amber = 'amber';
    case Pink = 'pink';
    case Blue = 'blue';
    case Green = 'green';
    case Coral = 'coral';
    case Gray = 'gray';
}
