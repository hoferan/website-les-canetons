# Writing an API controller here

Everything in this directory is published. Scramble reads these docblocks and
renders them at `GET /api/docs`, and orval copies them into the generated
TypeScript client. A note written for the next maintainer ends up in front of
an external developer who cannot act on it.

So the two audiences get two places.

## The docblock is the contract

A method docblock is read by somebody who has the reference open and nothing
else. It answers: what does calling this do, what comes back, what refuses me,
and what do I need to be allowed.

```php
/**
 * Book a place at an event.                          <- summary, imperative, one line
 *                                                    <- blank line
 * Anonymous. Returns the booking with its line items, the number of people
 * it is for and what it comes to.                    <- what the caller gets
 *
 * Refuses outside the registration window with `registration_not_open` or
 * `registration_closed`, and a booking larger than the event's per-booking
 * cap with `too_many_guests` against `choices`.      <- what refuses them
 */
```

Rules:

- **First line is a summary**: imperative, one line, no full stop needed.
  "Book a place at an event", not "This endpoint allows booking".
- **Then a blank line, then the description.** Lead with who may call it and
  what comes back.
- **Name every refusal a caller can act on**, with its `code`. A refusal they
  cannot avoid (a 500) is not worth documenting.
- **No dates, no measurements, no mutation notes, no decision references.**
  `C11`, `MEASURED 2026-09-10` and `found by mutation` mean nothing to a
  reader outside this repository.
- Write in the same voice as the rest of the reference. A developer reading
  twenty endpoints should not be able to tell they had different authors.

## The body is for the next maintainer, with one exception

Everything else goes in `//` comments inside the method. That is where the
measurements, the decision references, the traps and the arguments belong,
and nothing is lost by moving them there.

**Except directly above a `return`.** Measured 2026-09-10: Scramble
publishes the comment immediately preceding a return statement as that
operation's **200 response description**. Two endpoints had shipped a
paragraph of internal notes to `/api/docs` that way, decision codes and test
names included, while their docblocks were perfectly clean.

So either put the note higher in the method, or leave a blank line between it
and the `return`. A blank line is enough, and it is worth saying why in the
comment so nobody closes the gap while tidying.

```php
public function store(StoreRegistrationRequest $request, Event $event): JsonResponse
{
    // NO CAPACITY CHECK (G1), and that absence is what keeps this lock-free:
    // a count-then-insert would need a locking read on the one endpoint
    // strangers can hammer.
    ...
}
```

The same split applies to Form Requests and Resources: their class docblocks
become schema descriptions in the document, so the reasoning goes inside
`rules()` or `toArray()` as inline comments.

## Grouping

Each controller carries `#[Group]` so the reference reads as a handful of
domains rather than one section per class. Use an existing group name; a new
one needs a weight that puts it somewhere sensible in the list.
