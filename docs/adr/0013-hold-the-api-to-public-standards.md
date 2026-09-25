---
status: accepted
date: 2026-09-11
decision-makers: André Hofer
---

# Hold the API to public-API standards

## Context and Problem Statement

On 2026-09-11 the question was who the API is for: this SPA and a future maintainer,
or any client. That choice is what justifies the machinery below, which would
otherwise look like over-engineering for one SPA and invite someone to simplify it
away.

Two live bugs pushed parts of it. Two committee members editing the same event lost
the first edit to the second without a word. A guest tapping Book twice on a slow
phone made the caterer count two meals.

Who is the API for, and what does it owe its clients?

## Considered Options

- Any client, held to public-API standards
- This SPA and a future maintainer only
- Honouring `If-Match` or `Idempotency-Key` only when sent
- Entity tags over `updated_at`
- Cursor pagination
- Enveloping only the large collections

## Decision Outcome

Chosen option: "Any client, held to public-API standards", because André chose any
client as the API's audience on 2026-09-11, and two live bugs pushed parts of the
machinery as well.

The contract is versioned. Everything lives under `/api/v1/*`, mounted through
`ApiVersion::PREFIX`. `/api/docs`, `/api/docs.json` and `/api/migrate` describe or
operate the API rather than being part of it, and stay unversioned in
`api/routes/meta.php`. `ApiVersion` can emit `Deprecation`, `Sunset` and
successor-version `Link` headers, configured in `api/config/api.php` and all null for
v1.

Writes that replace or remove an existing thing require `If-Match`, through
`etag:<facet>` and `ConditionalWrite`. A missing header answers 428 and a stale one
412. The tag is a strong ETag over the rendered resource (`App\Support\EntityTag`), so
a change to a member's roles changes the member's tag. Only a single-item read hands
out a tag. Attendance is exempt, because it has one writer and one value, and a read
before every one-tap answer would cost more than it protects.

Both public POSTs require an `Idempotency-Key` (`IdempotentWrite`). A retry with the
same key replays the stored answer and creates nothing, and a different body under the
same key answers 409. Stored answers expire and are swept by lottery
([ADR-0009](0009-no-scheduler-and-no-queue.md)).

Every list answers `{data, meta}` with an RFC 8288 `Link` header, applied by
`PaginatesCollections` to any JSON list body. Pagination is by offset.

### Consequences

- Good, because a second edit made from a stale read answers 412 and cannot silently
  overwrite the first.
- Good, because a retried booking under the same key creates nothing.
- Good, because no controller can forget the list envelope.
- Bad, because a form reads its row as it opens and writes with that read's `ETag`,
  never a fresher one.
- Bad, because the SPA reads rows through `rowsOf()` in `web/src/api/collection.ts`,
  since orval wraps the envelope again. The mocked handlers envelope too.
- Bad, because the retention, lottery and version settings live in
  `api/config/api.php` and must never reach `api/.env.example`, where an extra key
  refuses every server's next deploy
  ([ADR-0005](0005-server-owned-files-never-travel-with-a-deploy.md)).
- Bad, because paging happens after the query. That is fine while every set is one
  page, about 45 members and 30 events a season.

## Pros and Cons of the Options

### This SPA and a future maintainer only

This was the other answer to the question put on 2026-09-11, and André chose any
client.

- Good, because it asks for less machinery, which for one SPA would otherwise look
  like over-engineering.

### Honouring `If-Match` or `Idempotency-Key` only when sent

- Bad, because it protects only the careful clients.

### Entity tags over `updated_at`

- Bad, because they miss role changes on the pivot table.

### Cursor pagination

- Bad, because every set here fits one page.

### Enveloping only the large collections

- Bad, because a controller could then forget the envelope.
