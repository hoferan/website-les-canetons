# 0021. Compute the committee inbox at read time

Status: Accepted, 2026-09-15

## Context

For two months, contact messages were stored and never shown to anyone. The committee
needed one place to see what is waiting for it.

A stored `inbox_items` table would need a producer in every controller that creates
something worth noticing. Forgetting one producer silently reproduces the bug above.

## Decision

The inbox is computed. `InboxRegistry` asks each `InboxSource` for its open items when
the inbox is read. Today there is one source, `ContactMessageSource`, where an item is
open while `handled_at` is null.

- Handled state is shared by the committee and records who handled it
  (`handled_by_member_id`, set to null if that member is deleted).
- The inbox filters by permission and never refuses. A member who may see no source
  gets an empty inbox, not a 403.
- `/inbox` is a worklist. Each source keeps its own archive, such as
  `/contact-messages`.
- The nav badge does not poll.

Rejected: a stored table; attendance answers as a source, because they are frequent
and the useful signal is who has not answered; per-member read state; and assignment
or snoozing.

## Consequences

Adding a source is one `InboxSource` implementation and one registry line. Issue #123
tracks new bookings as the next one, and the question of where their open state lives.

Each inbox load runs one query per source. A stored table could later sit behind
`InboxSource` without any caller noticing.
