---
status: accepted
date: 2026-09-09
decision-makers: André Hofer
---

# Answer in one tap, withdraw with a reason, undo for five minutes

## Context and Problem Statement

The typical member answering an event is a 13-year-old on a phone on a bus, so
answering has to be one tap. The direction needs to know who dropped out and why, and
chases the members who have not answered on Thursday evening. Unlimited undo would let
a member walk around any rule about withdrawing.

What rules govern giving, changing and undoing an answer?

## Considered Options

- One-tap answers, a note to withdraw, and five minutes of undo
- Unlimited undo
- A separate reason column
- A per-event answer deadline
- A per-event switch to turn attendance off

## Decision Outcome

Chosen option: "One-tap answers, a note to withdraw, and five minutes of undo",
because it keeps answering to one tap while the direction still learns who dropped out
and why.

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
- A member who does not play in a register is refused with `403 not_answerable`
  ([ADR-0014](0014-authorize-by-permission-never-by-role.md)).
- The chase list returns every answerable member, including those who never answered.

Attendance writes are exempt from `If-Match`
([ADR-0013](0013-hold-the-api-to-public-standards.md)).

### Consequences

- Good, because answering stays one tap.
- Good, because the direction sees who dropped out and why, and who has not answered.
- Bad, because after five minutes a member cannot go back to "no answer".

### Confirmation

Tests freeze time on both sides of the five-minute edge, and the seeded `demo.both` is
the fixture that makes the self-refusal testable.

## Pros and Cons of the Options

### Unlimited undo

- Bad, because it makes the note rule meaningless: a member could walk around any rule
  about withdrawing.

### A per-event answer deadline

It was deferred.

### A per-event switch to turn attendance off

- Bad, because every event takes attendance.

