---
status: accepted
date: 2026-09-08
decision-makers: André Hofer
---

# Keep one roster, where every member has an account

## Context and Problem Statement

The rebuild started on 2026-09-05 with `members` as "a row is a person, not an
account": credentials were nullable, so the roster could hold people who never log in.
That allowed a holder of `members.manage` with no login. Two administrators, delete
one, blank the other's username, and the band was locked out while every invariant
held, on a host with no shell to repair it.

The old site's data was no better a starting point. Its password hashes could not
carry over to the new hashing, its sign-up rows described a model that no longer
exists, and its one `admin` login was shared.

What is a row in `members`, and what does the roster start from?

## Considered Options

- One roster where every row can log in, entered fresh
- A row is a person, not an account, with nullable credentials
- Carrying the old site's data over

## Decision Outcome

Chosen option: "One roster where every row can log in, entered fresh", because a row
without a login could hold `members.manage` and lock the band out while every
invariant held.

One `members` table is the roster, and every row can log in: `username` and `password`
are NOT NULL. A young member's parent uses the child's login. People the band only
displays, such as instructors, honorary members and sponsors, are page content and not
rows here.

There is no email column, because most members are children. There is no `active`
flag, no season and no soft delete: a member who leaves is deleted, and their
attendance goes with them. Public pages list only members with `public_visible`, which
defaults to false.

Nothing was carried over from the old site. The legacy tables are dropped
(`2026_09_05_000001_drop_legacy_domain_tables`), the roster of about 45 is entered by
hand, and everyone gets a fresh personal password from the committee
([ADR-0016](0016-the-committee-issues-every-password.md)), which is what ends the
shared account.

### Consequences

- Good, because the lockout rules stay small. `AccessIntegrity` refuses, with a 409,
  deleting or demoting the last holder of `members.manage`, and deleting yourself or
  removing your own `members.manage`.
- Bad, because deleting a member deletes their answers, so the UI names that damage
  before it happens.
- Bad, because history is not kept. A member who leaves and comes back is a new row.
- Bad, because `instructor_of_section_id` still sits on `members`, which does not
  quite fit the rule that displayed people are content.

QA and PROD, still on the old site, start empty at their cutover.

## Pros and Cons of the Options

### A row is a person, not an account

This is how the rebuild started on 2026-09-05.

- Good, because the roster could hold people who never log in.
- Bad, because it allowed a holder of `members.manage` with no login, and the band
  could be locked out with no shell to repair it.

### Carrying the old site's data over

- Bad, because its password hashes could not carry over to the new hashing.
- Bad, because its sign-up rows described a model that no longer exists.
- Bad, because its one `admin` login was shared.
