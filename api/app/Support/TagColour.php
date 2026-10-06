<?php

namespace App\Support;

/**
 * The colours an event tag may take (#107).
 *
 * A closed set of names rather than a free hex value, because the SPA pairs
 * each one with a tint and an ink that were checked together for 4.5:1 at the
 * chip's 12px. A hex the committee typed could not be. The pairs live in
 * web/src/styles.css; a name added here needs its pair there.
 */
enum TagColour: string
{
    case Violet = 'violet';
    case Teal = 'teal';
    case Amber = 'amber';
    case Pink = 'pink';
    case Blue = 'blue';
    case Green = 'green';
    case Coral = 'coral';
    case Gray = 'gray';
}
