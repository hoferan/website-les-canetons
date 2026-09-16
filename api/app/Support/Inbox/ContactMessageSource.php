<?php

namespace App\Support\Inbox;

use App\Models\ContactMessage;
use App\Support\Permission;
use Illuminate\Support\Collection;

/**
 * Messages from the public contact form that nobody has dealt with yet.
 *
 * The first inbox source, and the reason the inbox exists: these rows have
 * been accumulating since 2026-07-23 with no route that could read one.
 */
final class ContactMessageSource implements InboxSource
{
    public function kind(): string
    {
        return 'contactMessage';
    }

    public function permission(): Permission
    {
        return Permission::MessagesView;
    }

    /** @return Collection<int, InboxItem> */
    public function openItems(): Collection
    {
        return ContactMessage::query()
            ->whereNull('handled_at')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ContactMessage $message) => new InboxItem(
                kind: $this->kind(),
                id: $message->id,
                title: trim($message->first_name.' '.$message->last_name),
                // The subject when there is one, else the opening of the
                // message: a row with no second line reads as an empty item.
                summary: $message->subject ?: str($message->message)->limit(120)->value(),
                arrivedAt: $message->created_at,
                // Deep-links to the archive with this message already open, so
                // the inbox is a way through to the work rather than a
                // second place to do it.
                path: "/contact-messages?open={$message->id}",
            ));
    }

    public function openCount(): int
    {
        return ContactMessage::query()->whereNull('handled_at')->count();
    }
}
