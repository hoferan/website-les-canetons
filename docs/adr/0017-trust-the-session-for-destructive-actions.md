---
status: accepted
date: 2026-09-08
decision-makers: André Hofer
---

# Trust the session for destructive administrator actions

## Context and Problem Statement

The members' area first required the current password again before deleting a member,
replacing their roles or resetting their password. That protects against one thing, a
logged-in device left unattended. The same session already reads the whole roster and
edits anyone, so the check locked three doors out of seventeen.

Should a destructive administrator action ask for anything beyond the session?

## Considered Options

- Trust the session cookie, and let the interface prevent mistakes
- A password on every destructive request
- A time-limited "sudo" window
- Check the typed name on the server

## Decision Outcome

Chosen option: "Trust the session cookie", because the same session already reads the
whole roster and edits anyone, so a password check locked only three doors out of
seventeen.

The destructive roster and event endpoints trust the session cookie. Preventing
mistakes is the interface's job: `ConfirmByTypingName` guards deleting a member, and
every other destructive confirmation names the damage it will do, for example how many
answers a deletion removes.

Re-authentication survives in one place, `POST /me/password`, where the current
password is the operation's own input
([ADR-0016](0016-the-committee-issues-every-password.md)).

### Consequences

- Good, because protection against mistakes sits in the interface, where each
  confirmation names the damage it will do.
- Bad, because someone holding an unlocked, logged-in administrator's phone can delete
  members and reset any password, including another administrator's. This was accepted
  knowingly.

`App\Support\Reauthentication` and `ReauthenticationFailed` have exactly one caller.

## Pros and Cons of the Options

### A password on every destructive request

This was the first design.

- Good, because it protects against a logged-in device left unattended.
- Bad, because the same session already reads the whole roster and edits anyone, so
  the check locked three doors out of seventeen.

### Check the typed name on the server

- Bad, because the server cannot tell typing from a script.

