---
status: accepted
date: 2026-10-26
decision-makers: André Hofer
---

# Track booking changes in a journal, and mark a guest list read once for the whole committee

## Context and Problem Statement

Nobody heard about a booking. The guest got a confirmation mail, and the committee
found out only when somebody opened the event's guest list. The committee works
from an exported spreadsheet, refreshed every couple of weeks and once more after
sign-ups close. So it needs to see when an event's bookings have moved since it
last looked. A notice for every booking would be noise.

The inbox is computed when it is read (ADR 0021). To show an event whose bookings
moved, the server has to know what changed since the committee's last look and
who changed it, cancellations included. A cancelled booking is deleted, so today
nothing is left to show that it ever existed.

How should the inbox know what changed in an event's bookings, and where does
"the committee has looked" live?

## Considered Options

- A journal of booking changes, written by the model, and a shared read mark that
  points into it
- Timestamps on bookings, with soft deletes for cancellations
- The audit log

## Decision Outcome

Chosen option: "A journal of booking changes", because it covers new, changed and
cancelled bookings, records who made each change, and is written in one place
that no controller can forget.

- `booking_changes` holds one row per booking per write: `new`, `changed` or
  `cancelled`, with the actor's name captured at the time. `Registration`'s model
  hooks and `writeChoices()` write it, after the transaction commits.
  Ticking "paid", saving a booking unchanged, and editing the form are not
  changes.
- `inbox_reads` holds the committee's read marks, keyed by inbox kind and item.
  It only grows. The newest row is the mark in force, and "mark as unread" deletes
  it. One mark serves the whole committee, as with handled contact messages.
- A mark points at a journal entry. The screen sends the newest change it showed
  (`upTo`), so a booking that lands while somebody reads stays unread, which a
  timestamp taken on the click would hide.
- Counts are net per booking since the mark. A booking made since is `new`
  however often it was amended, and a booking that existed at the mark and is
  gone is `cancelled`. A booking made and cancelled between two reads counts for
  nothing. The inbox counts and the guest list's row tags therefore always
  agree.
- Each event gets one inbox item, however many of its bookings moved. It shows
  while the event is published, has a booking form, and its day is not over.

### Consequences

- Good, because a new write path is journaled without anyone remembering to: the
  hook sits on the model.
- Good, because the cursor cannot swallow a change the reader never saw: journal
  ids follow commit order, since rows are written after commit.
- Good, because the next inbox source that needs a shared read mark reuses
  `inbox_reads` without a migration.
- Bad, because two tables and a backfill ship for a feature with a handful of
  items a year.
- Bad, because a write path that skips the model (a raw query, a database-level
  cascade) is not journaled. Deleting an event cascades its bookings that way,
  which is fine only because its journal and its item go with it.

### Confirmation

`BookingJournalTest` pins one row per write, nothing for "paid" or an untouched
re-save, and the after-commit write. `BookingDeltaTest` pins the per-booking net.
`BookingReadEndpointTest` pins that a change arriving after the screen loaded
stays unread.

## Pros and Cons of the Options

### Timestamps on bookings, with soft deletes for cancellations

- Good, because it adds no table.
- Bad, because every query reading bookings would have to skip cancelled rows:
  the guest list, the four export formats, capacity, a member's own booking and
  the planning's head count. One miss shows a cancelled guest to the caterer.
- Bad, because it does not record who made a change.

### The audit log

- Good, because corrections and cancellations by the committee are already in it.
- Bad, because its entries carry no event, so a deleted booking cannot be traced
  to its event without reshaping the log.
- Bad, because it would turn a record of privileged actions into a feed of public
  traffic.

## More Information

Extends ADR 0021, which named this question. Members' own bookings are the
ones ADR 0034 introduced. Issue #123.

Left for later: an archive of past inbox items, and payment tracked in the app
instead of the committee's spreadsheet. Each has its own issue.
