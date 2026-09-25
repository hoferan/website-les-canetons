---
status: accepted
date: 2026-09-15
decision-makers: André Hofer
---

# Compute the committee inbox at read time

## Context and Problem Statement

For two months, contact messages were stored and never shown to anyone. The committee
needed one place to see what is waiting for it.

A stored `inbox_items` table would need a producer in every controller that creates
something worth noticing. Forgetting one producer silently reproduces the bug above.

How should the committee inbox find what is waiting?

## Considered Options

- Compute the inbox at read time from registered sources
- A stored `inbox_items` table
- Attendance answers as a source
- Per-member read state
- Assignment or snoozing

## Decision Outcome

Chosen option: "Compute the inbox at read time", because it needs no producer in any
controller, so there is no producer to forget.

`InboxRegistry` asks each `InboxSource` for its open items when the inbox is read.
Today there is one source, `ContactMessageSource`, where an item is open while
`handled_at` is null.

- Handled state is shared by the committee and records who handled it
  (`handled_by_member_id`, set to null if that member is deleted).
- The inbox filters by permission and never refuses. A member who may see no source
  gets an empty inbox instead of a 403.
- `/inbox` is a worklist. Each source keeps its own archive, such as
  `/contact-messages`.
- The nav badge does not poll.

### Consequences

- Good, because adding a source is one `InboxSource` implementation and one registry
  line.
- Good, because a stored table could later sit behind `InboxSource` without any caller
  noticing.
- Bad, because each inbox load runs one query per source.

## Pros and Cons of the Options

### A stored `inbox_items` table

- Bad, because it would need a producer in every controller that creates something
  worth noticing, and forgetting one silently reproduces the bug of contact messages
  that nobody saw.

### Attendance answers as a source

- Bad, because answers are frequent, and the useful signal is who has not answered.

## More Information

Issue #123 tracks new bookings as the next source, and the question of where their
open state lives.
