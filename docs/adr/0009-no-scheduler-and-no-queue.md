---
status: accepted
date: 2026-09-10
decision-makers: André Hofer
---

# Work without a scheduler or a queue

## Context and Problem Statement

The host runs no cron and no long-lived processes, so Laravel's scheduler and queue
workers are not available. Several features would normally lean on them: mail after a
booking or a contact message, expiry of stored idempotency answers, and reminders for
members who have not answered an event.

How does the API do that work without anything running later?

## Considered Options

- Nothing depends on work happening later
- Laravel's scheduler and queue workers
- Automatic reminders by email or push

## Decision Outcome

Chosen option: "Nothing depends on work happening later", because the host offers no
cron and no long-lived process to do that work.

- Mail is sent inline, after the database transaction commits. A failed send is logged
  at `error` and never fails the request. `RegistrationController` and
  `ContactController::notify()` both follow this.
- Housekeeping runs by lottery on a write. `IdempotentWrite` sweeps expired rows on a
  small fraction of requests, configured in `api/config/api.php`.
- There are no automatic reminders. The direction gets a chase list of members who
  have not answered, with a button that copies a message for WhatsApp, which is where
  the band already talks. Nobody is emailed or pushed.

### Consequences

- Good, because if the band moves to a host with a scheduler, each of these is a small
  change and none of them needs a redesign.
- Bad, because a slow mail server makes the request slower.
- Bad, because a mail that fails is lost apart from the log line. The row it was about
  is still stored.

A sweep that never draws the lottery leaves expired rows behind, which is harmless.

## Pros and Cons of the Options

### Laravel's scheduler and queue workers

- Bad, because the host runs no cron and no long-lived processes.

### Automatic reminders by email or push

- Bad, because most members are children, and the band already talks on WhatsApp.
