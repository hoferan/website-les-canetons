# 0020. Make public registration a property of an event

Status: Accepted, 2026-09-10

## Context

The band's yearly souper took bookings through a feature of its own: its own routes, a
`SOUPER_SIGNUP_ENABLED` flag and an occasion in the configuration. Running it again
next year, or taking bookings for anything else, meant a deploy.

## Decision

Any event can take bookings. An event takes them exactly when
`registration_closes_at` is set; there is no separate boolean beside it. Its options,
such as menus and prices, are rows the committee fills in.

- There is no capacity limit, which also avoids a count-then-insert race on an
  anonymous endpoint.
- Guests cannot change their own booking. The committee corrects it.
- Prices are integer centimes.
- An option that has bookings cannot be deleted (`409 option_has_registrations`).
- The public form for an event that is not taking bookings answers 404, not 403.
- Seeing bookings (`registrations.view`) and changing them (`registrations.manage`)
  are separate permissions (ADR 0014).

## Consequences

Next year's souper is a form the committee fills in, not a release.

A popular event can be overbooked, and the committee manages that by closing
registration.

Bookings go through the anonymous-write guard (ADR 0019) and the idempotency key (ADR
0013), and the confirmation mail is sent inline (ADR 0009).
