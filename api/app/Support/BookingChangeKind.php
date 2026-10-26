<?php

namespace App\Support;

/**
 * What happened to a booking, as the journal records it (ADR 0035).
 *
 * `Created` rather than `New`: the stored value is `new`, but a case named
 * after a keyword reads badly at every call site.
 */
enum BookingChangeKind: string
{
    case Created = 'new';
    case Changed = 'changed';
    case Cancelled = 'cancelled';
}
