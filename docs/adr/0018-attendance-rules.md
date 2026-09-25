# 0018. Answer in one tap, withdraw with a reason, undo for five minutes

Status: Accepted, 2026-09-09

## Context

The typical member answering an event is a 13-year-old on a phone on a bus, so
answering has to be one tap. The direction needs to know who dropped out and why, and
chases the members who have not answered on Thursday evening. Unlimited undo would let
a member walk around any rule about withdrawing.

## Decision

The rules live in `App\Support\AttendanceIntegrity`:

- An answer is `yes` or `no`, written by an idempotent `PUT`. There is no "maybe".
- Changing your own answer from yes to no needs a note. No other change does.
- `DELETE`, which undoes an answer, works only within five minutes of the last write,
  and answers `409 answer_already_settled` after that.
- The direction can record an answer on a member's behalf with
  `attendance.record_for_others`. That never needs a note, and it sets
  `recorded_by_member_id`. It has its own `DELETE`, which starts the member's
  five-minute clock from the direction's write.
- The on-behalf route refuses its own caller with `409 cannot_record_for_self`, so the
  withdrawal rule cannot be bypassed by answering for yourself through it.
- A member who does not play in a register is refused with `403 not_answerable` (ADR
  0014).
- The chase list returns every answerable member, including those who never answered.

Attendance writes are exempt from `If-Match` (ADR 0013).

Rejected: unlimited undo, which makes the note rule meaningless; a separate reason
column; a per-event answer deadline, deferred; and a per-event switch to turn
attendance off, since every event takes it.

## Consequences

After five minutes a member cannot go back to "no answer".

Tests freeze time on both sides of the five-minute edge, and the seeded `demo.both` is
the fixture that makes the self-refusal testable.
