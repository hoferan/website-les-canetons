<?php

namespace App\Support\Inbox;

use Carbon\CarbonImmutable;

/**
 * The progress an `eventBookings` inbox item shows (#123).
 *
 * Numbers, not sentences: the SPA words them in French or German.
 */
final readonly class EventBookingsFacts
{
    /**
     * @param  array{new: int, changed: int, cancelled: int}  $changes
     * @param  list<string>  $actors
     * @param  list<array{label: string, remaining: int}>  $nearlyFull
     */
    public function __construct(
        public ?CarbonImmutable $startsAt,
        public int $bookings,
        public int $guests,
        public CarbonImmutable $closesAt,
        public bool $closed,
        public array $changes,
        public array $actors,
        public int $latestChangeId,
        public array $nearlyFull,
    ) {}
}
