# 0017. Trust the session for destructive administrator actions

Status: Accepted, 2026-09-08

## Context

The members' area first required the current password again before deleting a member,
replacing their roles or resetting their password. That protects against one thing, a
logged-in device left unattended. The same session already reads the whole roster and
edits anyone, so the check locked three doors out of seventeen.

## Decision

The destructive roster and event endpoints trust the session cookie. Preventing
mistakes is the interface's job: `ConfirmByTypingName` guards deleting a member, and
every other destructive confirmation names the damage it will do, for example how many
answers a deletion removes.

Re-authentication survives in one place, `POST /me/password`, where the current
password is the operation's own input (ADR 0016).

Rejected: a password on every destructive request, a time-limited "sudo" window, and
checking the typed name on the server, which cannot tell typing from a script.

## Consequences

Accepted knowingly: someone holding an unlocked, logged-in administrator's phone can
delete members and reset any password, including another administrator's.

`App\Support\Reauthentication` and `ReauthenticationFailed` have exactly one caller.
