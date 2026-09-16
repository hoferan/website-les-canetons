<?php

namespace App\Support\Inbox;

use Carbon\CarbonInterface;

/**
 * One thing somebody has to deal with.
 *
 * A value object with no table behind it. The inbox is computed from its
 * sources at read time, so an item exists only for as long as it takes to
 * answer one request — which is what makes it impossible for the inbox to
 * drift from the rows it describes.
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
    ) {}
}
