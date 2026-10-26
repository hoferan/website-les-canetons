<?php

namespace App\Http\Resources;

use App\Support\Inbox\BookingDelta;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Whether the committee has read an event's guest list, and what moved since.
 *
 * Counts are net per booking since the read mark in force (ADR 0035), so they
 * match the rows tagged in `newIds` and `changedIds`.
 *
 * @mixin BookingDelta
 */
class BookingReadResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            /** The mark in force; send it as `mark` to mark the list unread. Null when nobody has read the list yet. */
            'markId' => $this->mark?->id,
            /** When the mark in force was set; null when nobody has read the list yet. */
            'readAt' => $this->mark === null ? null : Iso8601::utc($this->mark->created_at),
            /** Who set it, as they were named then. */
            'readBy' => $this->mark?->read_by_label,
            /** The newest journal entry for this event, 0 when there is none. Send it as `upTo` to mark the list read. */
            'latestChangeId' => $this->latestChangeId,
            /** @var array{new: int, changed: int, cancelled: int} */
            'changes' => [
                'new' => count($this->newIds),
                'changed' => count($this->changedIds),
                'cancelled' => $this->cancelled,
            ],
            /**
             * Bookings made since the mark and still on the list.
             *
             * @var list<int>
             */
            'newIds' => $this->newIds,
            /**
             * Bookings that existed at the mark and changed since.
             *
             * @var list<int>
             */
            'changedIds' => $this->changedIds,
            /**
             * Who made those changes, newest first. Guests are left out.
             *
             * @var list<string>
             */
            'actors' => $this->actors,
        ];
    }
}
