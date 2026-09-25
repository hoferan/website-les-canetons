# 0009. Work without a scheduler or a queue

Status: Accepted, 2026-09-10

## Context

The host runs no cron and no long-lived processes, so Laravel's scheduler and queue
workers are not available. Several features would normally lean on them: mail after a
booking or a contact message, expiry of stored idempotency answers, and reminders for
members who have not answered an event.

## Decision

Nothing in the API depends on work happening later.

- Mail is sent inline, after the database transaction commits. A failed send is logged
  at `error` and never fails the request. `RegistrationController` and
  `ContactController::notify()` both follow this.
- Housekeeping runs by lottery on a write. `IdempotentWrite` sweeps expired rows on a
  small fraction of requests, configured in `api/config/api.php`.
- There are no automatic reminders. The direction gets a chase list of members who
  have not answered, with a button that copies a message for WhatsApp, which is where
  the band already talks. Nobody is emailed or pushed, and most members are children.

## Consequences

A slow mail server makes the request slower. A mail that fails is lost apart from the
log line, and the row it was about is still stored.

A sweep that never draws the lottery leaves expired rows behind, which is harmless.

If the band moves to a host with a scheduler, each of these is a small change rather
than a redesign.
