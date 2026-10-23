---
status: accepted
date: 2026-10-23
decision-makers: André Hofer
---

# Open a booking form with its own switch, and let it ask for address and table

## Context and Problem Statement

[ADR-0020](0020-registration-is-a-property-of-an-event.md) made the closing date the
whole switch: an event takes bookings exactly when `registration_closes_at` is set, with
no boolean beside it that could drift out of step.

Since [ADR-0032](0032-compose-a-booking-form-from-blocks.md) a form is something the
committee builds, block by block. André wants the souper's form built and saved in
October and opened in December (#114). Under ADR 0020 a form with a closing date is
live the moment it is saved, so building it in advance means publishing a half-made
form.

The same session decided that address and table name, asked on every form until now,
are each the form's choice: a picnic list has no table.

What decides that the public may use a form, and which contact fields it asks for?

## Considered Options

- An explicit open switch per form, off for a new form
- Keep the closing date as the switch, and build the form before typing the date
- Use the opening date: a form opening in December is built in October

## Decision Outcome

Chosen option: "An explicit open switch per form", because it is the only one that
lets the committee save a form with all its settings, dates included, and still keep
it from the public.

- `registration_enabled` on the event, false for a new form. The public form and the
  booking POST answer the same 404 for a form that is not open as for an event with no
  form, so a stranger cannot tell them apart. The agenda offers no booking link for it.
- `takesRegistrations()` keeps its meaning, that the event has a form (the closing date
  is set). The committee's screens follow it, so the options editor and the guest list
  of a closed form stay reachable. `acceptsBookings()` is the public test: a form that
  exists and is open.
- The migration adds the column with a default of true, so every form taking bookings
  at deploy keeps taking them in the same statement, then drops the default to false.
- `registration_asks_address` and `registration_asks_table`, both true by default. A form
  that does not ask for one stores none, whatever a booking sends. Name, email and phone
  stay asked on every form.
- The closing date and the per-booking cap belong to the form too. Until the form editor
  (#319) takes them, they and the three switches stay on the event form.

### Consequences

- Good, because a form is built, checked and opened as three separate acts.
- Good, because closing a form keeps its bookings and its guest list, as clearing the
  closing date always did.
- Bad, because two settings now decide whether the public sees a form, the switch and
  the dates, which ADR 0020 avoided. The event form says so beside the switch.

### Confirmation

`RegistrationFormSettingsTest` pins the 404, the agenda, the new form starting closed,
the migration keeping today's forms open, and the two questions being asked or not.

## Pros and Cons of the Options

### Keep the closing date as the switch

- Good, because it adds nothing.
- Bad, because the form editor shows the closing date with the blocks, so saving a
  finished form would always open it.

### Use the opening date

- Good, because the column exists.
- Bad, because it only works when the opening day is known in advance, and a form left
  half-made past its opening day goes live.
