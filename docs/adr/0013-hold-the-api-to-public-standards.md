# 0013. Hold the API to public-API standards

Status: Accepted, 2026-09-11

## Context

On 2026-09-11 the question was who the API is for: this SPA and a future maintainer,
or any client. André chose any client. That choice is what justifies the machinery
below, which would otherwise look like over-engineering for one SPA and invite someone
to simplify it away.

Two live bugs pushed parts of it. Two committee members editing the same event lost
the first edit to the second without a word. A guest tapping Book twice on a slow
phone made the caterer count two meals.

## Decision

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
same key answers 409. Stored answers expire and are swept by lottery (ADR 0009).

Every list answers `{data, meta}` with an RFC 8288 `Link` header, applied by
`PaginatesCollections` to any JSON list body, so no controller can forget it.
Pagination is by offset.

Rejected: honouring `If-Match` or `Idempotency-Key` only when sent, which protects only
the careful clients; tags over `updated_at`, which miss role changes on the pivot
table; cursor pagination, when every set here fits one page; and enveloping only the
large collections.

## Consequences

A form reads its row as it opens and writes with that read's `ETag`, never a fresher
one.

The SPA reads rows through `rowsOf()` in `web/src/api/collection.ts`, because orval
wraps the envelope again. The mocked handlers envelope too.

The retention, lottery and version settings live in `api/config/api.php` and must
never reach `api/.env.example`, where an extra key refuses every server's next deploy
(ADR 0005).

Paging happens after the query. That is fine while every set is one page, about 45
members and 30 events a season.
