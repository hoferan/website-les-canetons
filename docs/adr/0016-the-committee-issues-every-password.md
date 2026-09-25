---
status: accepted
date: 2026-09-07
decision-makers: André Hofer
---

# Let the committee issue every password

## Context and Problem Statement

Members have no email address
([ADR-0015](0015-one-roster-every-member-has-an-account.md)), so there is nowhere to
send a reset link. Before the rebuild there was no way to create or reset a login
short of editing the database by hand.

How does a member get a password, and a new one when they forget it?

## Considered Options

- The committee mints every password, shown once
- Email or token resets
- Administrators setting a password they choose
- An artisan command for the first account

## Decision Outcome

Chosen option: "The committee mints every password, shown once", because there is no
address to send a reset to, and no administrator should know anyone's password.

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

### Consequences

- Good, because a minted password is never logged, and the member replaces it with
  their own at the next login.
- Bad, because the login page has no "forgot password" link. A member who forgets asks
  the committee.
- Bad, because the forced change after a first login is enforced by the SPA
  (`web/src/components/MustChangePassword.tsx`). The API does not refuse other calls
  while the flag is set.

`BOOTSTRAP_ADMIN_*` is one of the keys each server's `.env` must carry
([ADR-0005](0005-server-owned-files-never-travel-with-a-deploy.md)).

## Pros and Cons of the Options

### Email or token resets

- Bad, because there is no address to send them to.

### Administrators setting a password they choose

- Bad, because no administrator should know anyone's password.

### An artisan command for the first account

- Bad, because there is no shell to run it.
