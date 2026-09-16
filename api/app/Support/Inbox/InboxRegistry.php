<?php

namespace App\Support\Inbox;

use App\Models\Member;
use Illuminate\Support\Collection;

/**
 * Every inbox source, filtered to what one member may act on.
 *
 * FILTERS, NEVER REFUSES. A member holding none of the relevant permissions
 * gets an empty inbox rather than a 403: the nav entry is already hidden from
 * them, and the summary endpoint has to stay safe to call on every navigation
 * without the client first working out whether it is allowed to.
 *
 * The source list is hard-coded rather than injected. There is one source, a
 * container binding would be indirection with nothing on the other end of it,
 * and a second source is one line here.
 */
class InboxRegistry
{
    /** @return list<InboxSource> */
    private function sources(): array
    {
        return [new ContactMessageSource];
    }

    /** @return list<InboxSource> */
    private function sourcesFor(Member $member): array
    {
        return array_values(array_filter(
            $this->sources(),
            fn (InboxSource $source) => $member->hasPermission($source->permission()),
        ));
    }

    /**
     * Everything open that this member may act on, newest first across all
     * sources.
     *
     * @return Collection<int, InboxItem>
     */
    public function openFor(Member $member): Collection
    {
        return collect($this->sourcesFor($member))
            ->flatMap(fn (InboxSource $source) => $source->openItems())
            ->sortByDesc(fn (InboxItem $item) => $item->arrivedAt)
            ->values();
    }

    /**
     * How many are open per kind, for the nav badge.
     *
     * @return array<string, int>
     */
    public function countsFor(Member $member): array
    {
        $counts = [];

        foreach ($this->sourcesFor($member) as $source) {
            $counts[$source->kind()] = $source->openCount();
        }

        return $counts;
    }
}
