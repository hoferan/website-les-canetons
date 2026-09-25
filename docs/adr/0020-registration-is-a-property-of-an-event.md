---
status: accepted
date: 2026-09-10
decision-makers: André Hofer
---

# Make public registration a property of an event

## Context and Problem Statement

The band's yearly souper took bookings through a feature of its own: its own routes, a
`SOUPER_SIGNUP_ENABLED` flag and an occasion in the configuration. Running it again
next year, or taking bookings for anything else, meant a deploy.

Where should public registration live, so that taking bookings needs no deploy?

## Considered Options

- Registration as a property of any event
- A feature of its own for the souper

## Decision Outcome

Chosen option: "Registration as a property of any event", because next year's souper,
or bookings for anything else, then needs only data the committee fills in, with no
deploy.

Any event can take bookings. An event takes them exactly when
`registration_closes_at` is set; there is no separate boolean beside it. Its options,
such as menus and prices, are rows the committee fills in.

- There is no capacity limit, which also avoids a count-then-insert race on an
  anonymous endpoint.
- Guests cannot change their own booking. The committee corrects it.
- Prices are integer centimes.
- An option that has bookings cannot be deleted (`409 option_has_registrations`).
- The public form for an event that is not taking bookings answers 404 rather than
  403.
- Seeing bookings (`registrations.view`) and changing them (`registrations.manage`)
  are separate permissions ([ADR-0014](0014-authorize-by-permission-never-by-role.md)).

### Consequences

- Good, because next year's souper is a form the committee fills in, with no release.
- Good, because without a capacity limit there is no count-then-insert race on an
  anonymous endpoint.
- Bad, because a popular event can be overbooked. The committee manages that by
  closing registration.

## Pros and Cons of the Options

### A feature of its own for the souper

- Bad, because running it again next year, or taking bookings for anything else,
  meant a deploy.

## More Information

Bookings go through the anonymous-write guard
([ADR-0019](0019-guard-anonymous-writes.md)) and the idempotency key
([ADR-0013](0013-hold-the-api-to-public-standards.md)), and the confirmation mail is
sent inline ([ADR-0009](0009-no-scheduler-and-no-queue.md)).
