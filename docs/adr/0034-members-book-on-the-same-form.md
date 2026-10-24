---
status: accepted
date: 2026-10-24
decision-makers: André Hofer
---

# Let members book a form with their account, in the same table as guests

## Context and Problem Statement

Since [ADR-0032](0032-compose-a-booking-form-from-blocks.md) the committee builds a
booking form from blocks. Some forms are for the band rather than the public: t-shirt
sizes, who brings what to the picnic, a choice between two dates (#318).

[ADR-0020](0020-registration-is-a-property-of-an-event.md) made a booking something a
stranger sends: anonymous, with name, email and phone, written once, with no
self-service. A member account has a name and no email or phone, and a member should be
able to change an answer until the form closes.

Where does a member's booking live, and who may make one?

## Considered Options

- The same `registrations` table, with a nullable `member_id`
- A table of its own for member bookings
- Attendance, which members already answer

## Decision Outcome

Chosen option: "The same `registrations` table", because the guest list, the exports,
the planning badge and the ADR 0031 capacity count keep working without a second copy.

- A form's `registration_audience` is `public` or `members`, `public` by default. It is
  separate from `is_public`, which decides whether the event shows on the public site.
- A members form does not exist for a caller without a session: the public read and the
  public booking answer the same 404 as no form, and the agenda offers no link. The
  public booking refuses it with a session too, so a member cannot book twice.
- Any account may fill one in, through `events.view`, which the baseline role grants.
  André chose that over the musicians alone or a new permission.
- A member books at `/events/{event}/my-registration`: GET, PUT (creates or replaces the
  answers) and DELETE, until the form closes. The answers are validated as a guest's
  are. No contact field is asked, no confirmation mail is sent, and no anti-spam guard
  applies.
- The name is copied from the account on every write, so a renamed member's booking
  follows them and a deleted account's booking keeps a name. `email` and `phone` are
  nullable for it.
- One booking per member per event is a unique index on `(event_id, member_id)`. Every
  member write takes the ADR 0031 event lock first, capped or not, because "one each"
  is a check followed by an insert too. A change leaves its own places out of the
  capacity count.
- Member writes carry no `If-Match`, like answering an event: a member writes only
  their own booking, and ConditionalWrite's tag read would fix the snapshot before the
  lock.
- The planning card offers "fill in" or "my answers", from `myRegistration` on the event.
  The guest list marks a member's booking and offers no correction for it.

### Consequences

- Good, because one guest list, one export and one capacity count cover both kinds of
  booking, and a form can switch audience later without losing a booking.
- Good, because the committee needs nothing new to build a members form: one switch on
  the form editor.
- Bad, because once #317 lets the committee correct answers, a correction and a
  member's change can overwrite each other, which a tag would have caught.
- Bad, because `email` and `phone` are no longer guaranteed on a booking, so every
  reader of the guest list has to allow for their absence.

### Confirmation

`MemberRegistrationTest` covers the 404s, the one booking per member, the window, the
capacity count without the member's own places, the lock order, the event tag staying
put, the planning flags and the guest list mark.

## Pros and Cons of the Options

### A table of its own

- Good, because a guest's booking keeps its required email and phone.
- Bad, because the capacity count under the lock, the guest list and every export would
  read two tables.

### Attendance

- Good, because members already answer it.
- Bad, because an attendance answer is one value, with no blocks, quantities or caps.
