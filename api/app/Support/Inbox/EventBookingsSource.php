<?php

namespace App\Support\Inbox;

use App\Models\Event;
use App\Models\RegistrationOption;
use App\Support\BandTime;
use App\Support\Permission;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * One item per event whose bookings moved since the committee last marked
 * them read (#123, ADR 0035).
 *
 * Per event, never per booking: the committee works from an exported list,
 * so what it needs to notice is "this event's bookings changed", and an inbox
 * with a row per booking is one nobody opens.
 *
 * An event is a candidate while it is published, has a booking form and its
 * day is not over. Past that day it never shows again, read or not: there is
 * nothing left to do about it.
 *
 * A booking flagged as spam keeps its event here, read or not, until somebody
 * clears or cancels it (#332). The read mark is shared and needs only
 * `registrations.view`, so otherwise one reader would close the item before
 * anybody who can clear the flag, and send the held mail, had seen it.
 */
final class EventBookingsSource implements InboxSource
{
    /** A capped option with this many places left or fewer is worth a mention. */
    private const NEARLY_FULL = 5;

    public function kind(): string
    {
        return 'eventBookings';
    }

    public function permission(): Permission
    {
        return Permission::RegistrationsView;
    }

    /** @return Collection<int, InboxItem> */
    public function openItems(): Collection
    {
        return $this->open()->map(fn (array $open) => $this->item($open['event'], $open['delta'], $open['suspect']));
    }

    public function openCount(): int
    {
        return $this->open()->count();
    }

    /** @return Collection<int, array{event: Event, delta: BookingDelta, suspect: int<0, max>}> */
    private function open(): Collection
    {
        return Event::query()
            ->published()
            ->whereNotNull('registration_closes_at')
            ->whereRaw('COALESCE(ends_at, starts_at) >= ?', [BandTime::startOfToday()])
            ->get()
            ->map(fn (Event $event) => [
                'event' => $event,
                'delta' => BookingDelta::for($event),
                'suspect' => $event->registrations()->whereNotNull('suspect_fields')->count(),
            ])
            ->filter(fn (array $open) => $open['delta']->isOpen() || $open['suspect'] > 0)
            ->values();
    }

    private function item(Event $event, BookingDelta $delta, int $suspect): InboxItem
    {
        $event->loadCount('registrations')->loadSum(Event::guestCount(), 'quantity');

        return new InboxItem(
            kind: $this->kind(),
            id: $event->id,
            title: $event->title,
            // The progress is computed language, so it travels as `facts` and
            // is worded in the SPA (API JSON stays English).
            summary: '',
            // Null only for an item kept open by a flag alone, which then
            // dates from the newest flagged booking.
            arrivedAt: $delta->lastChangeAt ?? $this->newestFlagged($event),
            path: "/events/{$event->id}/registrations",
            facts: new EventBookingsFacts(
                startsAt: $event->starts_at,
                bookings: (int) $event->getAttribute('registrations_count'),
                guests: (int) $event->getAttribute('guest_count'),
                closesAt: $event->registration_closes_at,
                closed: $event->registration_closes_at->isPast(),
                changes: [
                    'new' => count($delta->newIds),
                    'changed' => count($delta->changedIds),
                    'cancelled' => $delta->cancelled,
                ],
                actors: $delta->actors,
                latestChangeId: $delta->latestChangeId,
                nearlyFull: $this->nearlyFull($event),
                // Every flagged booking still on the list, not only the ones
                // since the last read: each waits for somebody to clear it.
                suspect: $suspect,
            ),
        );
    }

    private function newestFlagged(Event $event): CarbonImmutable
    {
        $at = $event->registrations()->whereNotNull('suspect_fields')->max('created_at');

        return $at === null ? CarbonImmutable::now() : CarbonImmutable::parse($at);
    }

    /** @return list<array{label: string, remaining: int}> */
    private function nearlyFull(Event $event): array
    {
        return $event->registrationOptions()
            ->whereNotNull('capacity')
            ->withSum('choices', 'quantity')
            ->get()
            ->filter(fn (RegistrationOption $option) => $option->remaining() <= self::NEARLY_FULL)
            ->map(fn (RegistrationOption $option) => [
                'label' => (string) $option->label,
                'remaining' => (int) $option->remaining(),
            ])
            ->values()
            ->all();
    }
}
