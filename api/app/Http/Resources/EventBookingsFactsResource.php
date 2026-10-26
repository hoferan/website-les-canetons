<?php

namespace App\Http\Resources;

use App\Support\Inbox\EventBookingsFacts;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The progress of an event's bookings, for its inbox item (#123).
 *
 * Counts are net per booking since the committee last marked the guest list
 * read (ADR 0035). Option labels and actor names are content and render
 * verbatim; everything else is worded by the SPA.
 *
 * @mixin EventBookingsFacts
 */
class EventBookingsFactsResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'startsAt' => $this->startsAt === null ? null : Iso8601::utc($this->startsAt),
            /** Bookings on the guest list now. */
            'bookings' => $this->bookings,
            /** People those bookings cover, counted from the blocks that count guests. */
            'guests' => $this->guests,
            'closesAt' => Iso8601::utc($this->closesAt),
            /** Whether bookings have closed, so the next export is the final list. */
            'closed' => $this->closed,
            /**
             * Bookings that moved since the last read: made since (`new`),
             * changed since (`changed`), or gone since (`cancelled`).
             *
             * @var array{new: int, changed: int, cancelled: int}
             */
            'changes' => $this->changes,
            /**
             * Who made those changes, newest first. Guests on the public form
             * have no account and are left out.
             *
             * @var list<string>
             */
            'actors' => $this->actors,
            /** The newest journal entry for this event. Send it as `upTo` to mark the item read. */
            'latestChangeId' => $this->latestChangeId,
            /**
             * Capped blocks with five places or fewer left; `remaining` 0 is full.
             *
             * @var list<array{label: string, remaining: int}>
             */
            'nearlyFull' => $this->nearlyFull,
        ];
    }
}
