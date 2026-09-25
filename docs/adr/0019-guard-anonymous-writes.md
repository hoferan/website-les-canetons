# 0019. Guard anonymous writes with a honeypot, a signed timing token and a throttle

Status: Accepted, 2026-09-10

## Context

Two endpoints accept writes from anyone: the contact form and event bookings. Both
store rows, and a booking sends a confirmation to an address the caller chooses,
through the band's own mailbox. Abused, that gets the domain blacklisted.

The first answer, in July 2026, was a proof-of-work challenge (Altcha) with a table of
used challenges. It needs a browser widget, and it costs the most on the oldest phones,
which is who the site serves.

## Decision

`PublicWriteGuard` sits on both routes and checks two things:

- A honeypot field, `website`, which must be present and empty.
- An `X-Form-Token`: an HMAC over the time it was issued, signed with `APP_KEY`, valid
  from 2 seconds to 2 hours after issue. It is stateless and deliberately not
  single-use, so resubmitting after a validation error works. It fails closed when
  `APP_KEY` is empty.

Either failure answers the same `422 spam_suspected`.

A `public-write` rate limit of 10 per minute per address covers both POSTs and `GET
/form-token`. Because the token can be replayed within its window, the throttle is the
half that does the real work.

Rejected: proof-of-work, single-use tokens, and third-party CAPTCHA services.

## Consequences

No addresses are stored.

A token replayed inside its two hours is accepted. That is a small risk, bounded by
the throttle.

Both POSTs also require an `Idempotency-Key` (ADR 0013), which runs after the guard
and the throttle.
