---
status: accepted
date: 2026-10-30
decision-makers: André Hofer
---

# Let guests pick a table from the ones already booked, on the public form

## Context and Problem Statement

Since [ADR-0033](0033-a-booking-form-opens-with-its-own-switch.md) a booking form may
ask who the guest would like to sit with, as free text. The committee exports the guest
list and plans the seating on paper from it (#327). Free text splits one table into
several: "Müller", "Tisch Müller" and "müller" each became a block of their own on the
table plan sheet, and somebody had to merge them by hand before printing.

A table has nothing behind it but the name guests give it. The committee does not decide
the tables; guests do, by naming the people they come with.

How does a guest end up at the same table as the people they come with, under one name?

## Considered Options

- A table is its name, and the public form lists the names already booked
- Merge similar names in the export
- Tables as a thing of their own (`event_tables`), which bookings point at
- Tables the committee defines before bookings open

## Decision Outcome

Chosen option: "A table is its name, and the public form lists the names already
booked", because it needs one column and no screen, and it stops variants at the moment
they would be typed.

- A table is its name trimmed at both ends and compared exactly (`App\Support\TableName`).
  Grouping happens in PHP, because the column's collation compares case-insensitively.
- `GET /api/v1/events/{event}/registration` returns `tables`: the distinct names of the
  event's bookings, each with how many people it holds. The guest picks one or starts a
  new one. The list is empty unless a public form asks for a table, so a form without
  the field and a members form disclose nothing.
- An event may say how many seats a table has (`registration_table_seats`, 1 to 50). The
  form then shows how full each table is, and the table plan sheet prints a table with
  more people than seats in red. A full table stays selectable: the seats are a guide,
  never a limit.
- The committee's correction form uses the same picker, so a correction cannot start a
  variant either.

### Consequences

- Good, because one migration adds a nullable column, and no endpoint, permission or
  admin screen is needed.
- Good, because cancelling a booking takes its table name off the form with it, which is
  the whole moderation story.
- Bad, because the form is anonymous: anybody with its link sees the event's table names
  and how full each one is. André accepted this. A table name need not be a family name,
  and the guest chooses what to type.
- Bad, because a junk name (a URL, an insult) shows on the band's public form until
  direction cancels that booking. Flagging suspicious bookings is #332.
- Bad, because renaming a table means correcting every booking at it, and every table at
  an event has the same number of seats.

### Confirmation

`RegistrationPublicTest` pins what the form lists, including that "Müller" and "müller"
stay two tables and that a members form lists none. `RegistrationFormEditorTest` pins the
seats setting, and `GuestListTest` the red over-full row.

## Pros and Cons of the Options

### Merge similar names in the export

- Bad, because two unrelated families may both pick "Müller". Guessing that "müller" or
  "Tisch Müller" means the same table seats strangers together.

### Tables as a thing of their own

- Good, because a rename or a merge is one step, and each table could have its own seats.
- Bad, because it needs a table, endpoints, an ETag facet and a screen, for a committee
  that by André's account would not maintain them.

### Tables the committee defines

- Bad, because the committee does not decide who sits together. Guests do.

## More Information

Issue #327, and #332 for flagging suspicious bookings. Members forms still ask no table
([ADR-0034](0034-members-book-on-the-same-form.md)); asking one there would be a change
of its own.
