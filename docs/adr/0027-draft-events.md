---
status: accepted
date: 2026-09-30
decision-makers: André Hofer
---

# Write events as drafts and publish them as a separate act

## Context and Problem Statement

An event reached all forty-five members the moment `POST /api/v1/events`
returned. A committee member who was unsure of the venue either published
something wrong and corrected it in front of everybody, or kept the event in a
WhatsApp thread until it was certain, which is how planning stops living in the
planning. Generating a season made it worse: `POST /events/series` lands up to
sixty rows at once, and a wrong recurrence rule put every one of them on
everybody's screen.

Three constraints shaped the answer. The reason to write a draft is that
something is still unknown, so a draft has to save with a title and nothing
else. `ends_at` had been NOT NULL since the events migration, so that a
multi-day event is one whose start and end fall on different days and no
`weekend` flag can come back. And `is_public` already decides whether strangers
see a published event on `/agenda`, so whatever marks a draft must not be
confused with it.

How does an event exist, and stay editable, before the band sees it?

## Considered Options

- A nullable `published_at` on `events`, separate from `is_public`
- A `status` column with `draft` and `published` values
- A separate `event_drafts` table that becomes an event on publication
- Reuse `is_public = false` as "draft"

## Decision Outcome

Chosen option: "A nullable `published_at` on `events`", because the timestamp
is the whole state and cannot drift out of step with a second flag, which is the
argument ADR 0020 makes for `registration_closes_at` and the retired `weekend`
column also settled.

What this fixes:

- **Null means draft.** Existing rows are backfilled to `created_at` in the same
  migration step that adds the column, so a deploy publishes nothing new and
  hides nothing.
- **`POST /events` and `POST /events/series` always create drafts.** Only the
  title is required. `starts_at`, `ends_at` and `location` are nullable.
- **The C6 guarantee moves to the publish path.** `POST /events/{event}/publish`
  refuses a draft that lacks a start, an end or a location with
  `event_incomplete`, and names each missing field. A published event keeps the
  full rules on `PATCH`; the stored row decides which set applies.
- **Publishing needs `If-Match`.** It changes a thing somebody read first, so
  `POST` joined `PUT`, `PATCH` and `DELETE` in `ConditionalWrite`, which is safe
  because no other `POST` carries `etag:`.
- **`DELETE /events/{event}/publish` puts an event back to draft**, refused with
  `event_has_answers` once anybody has answered or booked.
- **A draft does not exist for anybody without `events.manage`.** One middleware,
  `event.published`, answers the ordinary 404 on every route that takes an
  event, so a member cannot tell a draft from an unknown id. The two public
  registration routes answer 404 to everyone, a logged-in manager included.
  A manager who can see a draft still cannot answer for it: attendance writes
  answer 409 `event_not_published`.
- **Drafts have a query of their own.** They all belong to the default half of
  `GET /events`, undated ones first, and never to `?past=1`. A dated split cannot
  place them, because `NULL >= today` is false and a dateless draft would answer
  neither half.
- **No new permission.** `events.manage` writes, sees and publishes drafts, as
  ADR 0014 asks: the people who draft and the people who review are the same.

### Consequences

- Good, because a wrong venue never reaches forty-five phones, and a generated
  season can be read before anyone else sees it.
- Good, because draft and public are independent axes: a draft marked public
  appears on no list and not on `/agenda`.
- Good, because `PublicEventResource` still promises four non-null fields, and a
  draft that ever reaches it throws instead of sending a null.
- Bad, because `startsAt`, `endsAt` and `location` are nullable in `EventResource`
  for every consumer, and each date-reading screen had to learn to show a
  missing date.
- Bad, because creating a complete event is now two calls. The form chains them
  and, if the second is refused, leaves the saved draft on its edit screen.
- Bad, because the database no longer enforces that a published event has both
  dates. Tests and the publish path do.

### Confirmation

`EventPublishTest::test_a_published_event_always_has_both_dates` pins the
guarantee that used to be a NOT NULL. `EventDraftVisibilityTest` pins who sees a
draft, and each of its guards was mutation-tested by removing it and watching a
test fail. `web/e2e/drafts.spec.ts` covers the screens against the mocked
backend, which proves the screens and not the filter.

## Pros and Cons of the Options

### A `status` column

- Good, because a value can be added later (`archived`, `cancelled`).
- Bad, because it duplicates what `published_at` already says and adds the
  question of which one wins when they disagree.

### A separate `event_drafts` table

- Good, because published rows would keep their NOT NULL columns.
- Bad, because publishing becomes a copy and a delete, ids change under anyone
  holding a link, and every read of "the planning" has to union two tables.

### Reuse `is_public = false`

- Bad, because `is_public = false` is already the default for a published event
  that only members should see. Reusing it would turn every existing private
  rehearsal into a draft.

## More Information

Issue #183.
