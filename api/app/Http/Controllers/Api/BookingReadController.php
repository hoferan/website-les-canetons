<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\MarkBookingsReadRequest;
use App\Http\Requests\UnmarkBookingsReadRequest;
use App\Http\Resources\BookingReadResource;
use App\Models\Event;
use App\Models\InboxRead;
use App\Support\Inbox\BookingDelta;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;

/**
 * The committee's shared read mark on an event's guest list (#123, ADR 0035).
 *
 * One mark for the whole committee: marking read takes the event's item out
 * of everybody's inbox, and the next change brings it back.
 */
#[Group('Registration', weight: 40)]
class BookingReadController extends Controller
{
    /**
     * Read whether the guest list was read, and what moved since.
     *
     * The screen keeps `latestChangeId` from this read and sends it back to
     * mark the list read.
     */
    #[Endpoint(operationId: 'bookingRead.show')]
    public function show(Event $event): BookingReadResource
    {
        return new BookingReadResource(BookingDelta::for($event));
    }

    /**
     * Mark the guest list read, up to what the screen showed.
     *
     * Everything up to `upTo` stops counting, for the whole committee. A
     * booking journaled after it stays unread, so a change that lands while
     * somebody is reading is never swallowed. Marking again with an `upTo`
     * the mark already covers writes nothing.
     */
    #[Endpoint(operationId: 'bookingRead.mark')]
    public function mark(MarkBookingsReadRequest $request, Event $event): BookingReadResource
    {
        $current = InboxRead::latestFor(InboxRead::EVENT_BOOKINGS, $event->id);

        if ($current === null || $current->read_up_to < $request->upTo()) {
            InboxRead::create([
                'kind' => InboxRead::EVENT_BOOKINGS,
                'subject_id' => $event->id,
                'read_up_to' => $request->upTo(),
                'read_by_member_id' => $request->user()->id,
                'read_by_label' => $request->user()->fullName(),
            ]);
        }

        return new BookingReadResource(BookingDelta::for($event));
    }

    /**
     * Mark the guest list unread.
     *
     * Takes back the mark in force, whoever set it, and the counts return to
     * what they were since the mark before. `mark` must be the `markId` this
     * screen read: when somebody has marked the list read since, nothing
     * changes and the fresh state comes back, so a stale tab cannot undo a
     * colleague's read.
     */
    #[Endpoint(operationId: 'bookingRead.unmark')]
    public function unmark(UnmarkBookingsReadRequest $request, Event $event): BookingReadResource
    {
        $current = InboxRead::latestFor(InboxRead::EVENT_BOOKINGS, $event->id);

        if ($current !== null && $current->id === $request->mark()) {
            $current->delete();
        }

        return new BookingReadResource(BookingDelta::for($event));
    }
}
