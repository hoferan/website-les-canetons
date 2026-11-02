---
status: accepted
date: 2026-11-02
decision-makers: André Hofer
---

# Flag public bookings and messages that carry a link or markup

## Context and Problem Statement

Both public forms sit behind the honeypot, the signed timing token and the throttle of
[ADR-0019](0019-guard-anonymous-writes.md). A person typing by hand gets through, and so
does a script that waits two seconds and stays under the throttle. After that, nothing
looks at what a submission says.

Since [ADR-0036](0036-a-booking-form-shows-its-tables.md) that matters more. The public
booking form lists the table names of the event's bookings, so a junk table name (a URL,
an insult) shows to anyone with the form's link until direction cancels the booking. The
confirmation mail also goes from the band's mailbox to whatever address the booking
gave, carrying the names it was given.

What should the API do with a submission whose words look like spam?

## Considered Options

- Store it and flag it, with the fields that tripped the check
- Refuse it
- Compute the flag when the committee reads the row

## Decision Outcome

Chosen option: "Store it and flag it", because a false alarm then costs one click and
never a lost booking.

- One signal for now: `http://`, `https://`, `www.`, `<` or `[url` in a free-text field
  (`App\Support\SpamSignals`). For a booking that is the first and last name, the
  address, the table and the free-text answers; for a message, the names, the subject and
  the body. André knew of no junk that had arrived, so the cheapest check that catches
  links went first.
- The fields that tripped it are stored with the row, in `suspect_fields` on
  `registrations` and `contact_messages`, null when none did. The API returns them as
  `suspectFields`, an empty list for a clean row.
- A flagged booking's table stays off the public form until the flag is cleared, and its
  confirmation mail is held until then. Clearing it sends the mail.
- `registrations.manage` clears a booking's flag and `messages.manage` a message's, with
  `{"suspect": false}` on the PATCH each already has. No new permission
  ([ADR-0014](0014-authorize-by-permission-never-by-role.md)).
- Clearing a flag is not a booking change in the journal of
  [ADR-0035](0035-shared-read-marks-and-a-booking-change-journal.md).
- The guest list card, the message card and panel, the inbox and the guest list export
  show the flag and its fields. The till and table plan sheets do not.
- A member's own booking is never checked: it comes from an account.

### Consequences

- Good, because nothing a real guest sends is lost to a wrong guess.
- Good, because the band's mailbox does not carry a stranger's link to an address the
  stranger chose.
- Bad, because a real guest with a URL in a field waits for their confirmation until
  somebody clears the flag. A table name or a person's name rarely holds one.
- Bad, because a contact message with a genuine link (a venue's website) is flagged too.
  The flag only marks it, so this costs one click.
- Bad, because a junk name with no link or markup still shows on the form. Nonsense
  names and repeated addresses were left out: they catch real people too.

### Confirmation

`SpamSignalsTest` pins what counts as a link or markup. `SuspectBookingTest` pins the
held mail, the hidden table and who may clear the flag, and `SuspectMessageTest` the
message and the inbox.

## Pros and Cons of the Options

### Refuse it

- Bad, because a false positive loses a booking, and the guest is told only that their
  submission was refused. ADR-0019 already refuses what is clearly automated.

### Compute the flag when the committee reads the row

- Good, because a better check would apply to old rows too.
- Bad, because the held mail and the hidden table need a state that clearing can change,
  and a changed rule would re-flag rows somebody had already cleared.

## More Information

Issue #332. Blocking addresses and CAPTCHAs stay out of scope, for the reasons in
ADR-0019.
