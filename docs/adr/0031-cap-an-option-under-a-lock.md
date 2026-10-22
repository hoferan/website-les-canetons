---
status: accepted
date: 2026-10-22
decision-makers: André Hofer
---

# Cap how many of an option can be booked, counting under a lock on the event

## Context and Problem Statement

[ADR-0020](0020-registration-is-a-property-of-an-event.md) left capacity out. The old
souper had none, and a count followed by an insert races on the one endpoint strangers
can call: two guests read one place left and both get it. The committee was to watch
the guest list and bring the closing date forward instead.

That leaves the hall able to be oversold. The form says "at most 6 people" per booking
and nothing caps the total, although the system already knows the number (#114).

How can an option be capped without the race?

## Considered Options

- A capacity per option, counted under a row lock on the event
- A capacity per option, counted without a lock
- No capacity, as before

## Decision Outcome

Chosen option: "A capacity per option, counted under a row lock on the event", because
it closes the race with one statement on a database that already has row locks, and
costs nothing for an event without a capacity.

- `event_registration_options.capacity` is a nullable whole number of at least 1. Null
  is no limit, which is every option that existed before.
- A booking that asks for an option with a capacity locks the event's row
  (`SELECT … FOR UPDATE`) as the first statement of its transaction, then counts and
  inserts. A second booking for the same event waits until the first commits.
- The lock comes first because InnoDB's REPEATABLE READ fixes a transaction's snapshot
  at its first plain read. A read before the lock would count against a snapshot older
  than the booking it waited for.
- A booking for options without a capacity takes no lock, as under ADR-0020.
- Asking for more than is left answers `400 validation_failed` against
  `choices.N.quantity` with `not_enough_places`, and books nothing.
- The form publishes `capacity` and `remaining` per option. `remaining` never goes below
  0. The committee may set a capacity under what is already booked to stop further
  bookings, and no existing booking changes.
- The `event.options` entity tag leaves `remaining` out, so a guest booking does not
  make the committee's open editor answer 412.

### Consequences

- Good, because the hall cannot be oversold, and the public form says how many places
  are left.
- Good, because an event without a capacity behaves exactly as before.
- Bad, because bookings for a capped event are serialized. At the souper's scale, about
  a hundred bookings over weeks, behind a throttle of 10 a minute per IP, nobody waits
  noticeably.
- Bad, because a capacity per option does not cap the room as a whole: the adult and
  children's meals each have their own number.

### Confirmation

`Tests\Feature\RegistrationCapacityTest` asserts that the event lock is the statement
right after the transaction begins, that an uncapped booking takes no lock, and that
a booking meanwhile does not stale the options tag. Each of those was checked by
breaking the code and watching the test fail.

## Pros and Cons of the Options

### A capacity per option, counted without a lock

- Good, because it needs no lock.
- Bad, because two guests reading the last place both get it, the case the capacity
  exists to prevent.

### No capacity, as before

- Good, because there is nothing to race.
- Bad, because the committee has to watch a number the system already knows.

## More Information

This replaces the "There is no capacity limit" point of ADR-0020. The rest of ADR-0020
stands.
