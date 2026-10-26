<?php

namespace App\Support\Inbox;

use Carbon\CarbonInterface;

/**
 * One thing somebody has to deal with.
 *
 * A value object with no table behind it. The inbox is computed from its
 * sources at read time, so an item exists only for as long as it takes to
 * answer one request, and the inbox cannot drift from the rows it describes.
 */
final readonly class InboxItem
{
    public function __construct(
        public string $kind,
        public int $id,
        public string $title,
        public string $summary,
        public CarbonInterface $arrivedAt,
        public string $path,
        // Numbers the SPA words on screen; null for a kind with none.
        // Computed language is translated in the SPA, so it travels as data.
        public ?EventBookingsFacts $facts = null,
    ) {}
}
