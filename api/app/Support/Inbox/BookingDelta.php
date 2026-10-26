<?php

namespace App\Support\Inbox;

use App\Models\BookingChange;
use App\Models\Event;
use App\Models\InboxRead;
use App\Models\Registration;
use App\Support\BookingChangeKind;
use Carbon\CarbonImmutable;

/**
 * What moved in an event's bookings since the committee last read them.
 *
 * Net per booking, never a tally of journal rows (ADR 0035): each booking now
 * against how it stood at the read mark. A booking made and amended since is
 * one `new`; one made and cancelled since never reached anybody's spreadsheet
 * and counts for nothing; one that existed at the mark and is gone now is
 * `cancelled`, whatever happened to it first. So the counts and the guest
 * list's row tags always agree.
 */
final readonly class BookingDelta
{
    /**
     * @param  list<int>  $newIds
     * @param  list<int>  $changedIds
     * @param  list<string>  $actors  newest first, guests left out
     */
    public function __construct(
        public ?InboxRead $mark,
        public int $latestChangeId,
        public array $newIds,
        public array $changedIds,
        public int $cancelled,
        public array $actors,
        public ?CarbonImmutable $lastChangeAt,
    ) {}

    public static function for(Event $event): self
    {
        $mark = InboxRead::latestFor(InboxRead::EVENT_BOOKINGS, $event->id);

        $journal = BookingChange::query()->where('event_id', $event->id);
        $latestChangeId = (int) (clone $journal)->max('id');

        $rows = $journal->where('id', '>', $mark?->read_up_to ?? 0)->orderBy('id')->get();
        $stillThere = Registration::query()
            ->whereIn('id', $rows->pluck('registration_id')->filter()->unique())
            ->pluck('id')
            ->flip();

        $newIds = [];
        $changedIds = [];
        $cancelled = 0;
        $netted = collect();

        foreach ($rows->whereNotNull('registration_id')->groupBy('registration_id') as $id => $group) {
            $exists = $stillThere->has($id);
            $createdSince = $group->contains('change', BookingChangeKind::Created);

            if ($exists && $createdSince) {
                $newIds[] = (int) $id;
            } elseif ($exists) {
                $changedIds[] = (int) $id;
            } elseif (! $createdSince) {
                $cancelled++;
            } else {
                continue;
            }

            $netted = $netted->concat($group);
        }

        $netted = $netted->sortByDesc('id');

        return new self(
            mark: $mark,
            latestChangeId: $latestChangeId,
            newIds: $newIds,
            changedIds: $changedIds,
            cancelled: $cancelled,
            actors: $netted->pluck('actor_label')->filter()->unique()->values()->all(),
            lastChangeAt: $netted->first()?->created_at?->toImmutable(),
        );
    }

    /** Whether any booking moved since the mark, i.e. the item is in the inbox. */
    public function isOpen(): bool
    {
        return $this->newIds !== [] || $this->changedIds !== [] || $this->cancelled > 0;
    }
}
