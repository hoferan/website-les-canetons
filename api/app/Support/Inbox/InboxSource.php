<?php

namespace App\Support\Inbox;

use App\Support\Permission;
use Illuminate\Support\Collection;

/**
 * Something that can put work in the committee's inbox.
 *
 * ADDING A SOURCE IS A CLASS AND A REGISTRY LINE, deliberately — see the
 * design doc for why the inbox is computed rather than materialised. A source
 * owns its own definition of "open"; nothing here stores state.
 */
interface InboxSource
{
    /** A stable machine name. It reaches the SPA and is translated there. */
    public function kind(): string;

    /** What a member must hold to see, and act on, items of this kind. */
    public function permission(): Permission;

    /** @return Collection<int, InboxItem> */
    public function openItems(): Collection;

    /** The same set, counted, without building the items. */
    public function openCount(): int;
}
