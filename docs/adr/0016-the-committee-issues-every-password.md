# 0016. Let the committee issue every password

Status: Accepted, 2026-09-07

## Context

Members have no email address (ADR 0015), so there is nowhere to send a reset link.
Before the rebuild there was no way to create or reset a login short of editing the
database by hand.

## Decision

Creating a member mints a password, and resetting one (`POST
/members/{member}/password`) is the same operation. The password is shown once, to be
read out over the phone or handed over on paper. It is never logged, and the audit log
records that it happened, not what it was.

`App\Support\GeneratedPassword` builds it from a 27-character alphabet with the
confusable characters removed, in three hyphenated groups of four, about 57 bits. A
reissue never lands on the password already stored. `must_change_password` makes the
member choose their own at the next login.

A member changing their own password gives the current one, throttled per member, so a
borrowed phone cannot lock the owner out. A "change" to the same password is refused.

The first administrator comes from a migration that reads `BOOTSTRAP_ADMIN_*` from the
server's `.env`, and only runs while nobody holds `members.manage`. It refuses a
password shorter than 12 characters.

Rejected: email or token resets, with no address to send them to; administrators
setting a password they choose, because no administrator should know anyone's
password; and an artisan command for the first account, with no shell to run it.

## Consequences

The login page has no "forgot password" link. A member who forgets asks the committee.

The forced change after a first login is enforced by the SPA
(`web/src/components/MustChangePassword.tsx`). The API does not refuse other calls
while the flag is set.

`BOOTSTRAP_ADMIN_*` is one of the keys each server's `.env` must carry (ADR 0005).
