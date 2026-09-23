# Searching the roster and the planning

Design for [#97](https://github.com/hoferan/website-les-canetons/issues/97).
Decided 2026-09-23.

## What the issue asks

- `/members`: search across name and identifiant, and filter by pupitre and
  by rôle.
- `/events`: search by title and lieu, alongside the existing day filter.

## Decided: on the server, not over the rows already loaded

Both lists arrive whole today. `Page::DEFAULT_LIMIT` is 500 and the roster is
~45, so filtering the loaded rows in the browser would work, and would be
quicker to build. It was rejected on one argument:

**A filter has to run where the slice runs.** `PaginatesCollections` slices
on the server, and the roster heading reads `meta.total` precisely so that it
stays right "the day this list is ever cut short". A browser-side filter over a
cut-short list searches page one and silently misses everything else. On the
server the controller narrows the query, the middleware slices what is left,
and `meta.total` counts the matches. The day the slice moves into the query,
nothing here changes.

It also puts search on the public `/api/v1` contract, documented at
`/api/docs` and pinned by PHP tests, rather than inside one screen.

**The day filter stays in the browser.** It narrows the loaded half of the
planning to one calendar date the calendar was drawn from; it is not a search.

## API

### `GET /api/v1/members`

| parameter | matches                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `q`       | first name, last name, username, and "first last" / "last first" as one string |
| `section` | a register id, or the literal `none` for members in no register                |
| `role`    | a role id                                                                      |

### `GET /api/v1/events`

| parameter | matches                   |
| --------- | ------------------------- |
| `q`       | the title or the location |

`past` is unchanged and combines with `q`.

### Rules common to both

- Every parameter is optional; absent or empty means "no filter". Filters
  combine with AND.
- `q` is trimmed, at most 100 characters, and is a substring match. `%`, `_`
  and `\` are escaped, so a `%` typed into the box finds a `%` rather than
  everything.
- **Case and accents are free.** The connection collation is
  `utf8mb4_unicode_ci` (`api/config/database.php`) on both 10.3 and 10.11, so
  `LIKE 'helene'` finds "Hélène" without anything in PHP.
- An id that names nothing (a deleted register, a role that does not exist)
  answers an empty list, not an error: a filter that matches nobody is a
  result, and a stale select should not break the screen.
- A malformed value (`section=abc`, `role=1.5`, a 101-character `q`) answers
  the existing `400 validation_failed` with the existing reason tokens
  (`invalid_format`, `invalid_type`, `too_long`). No new token, so no new copy
  in `fr.ts` / `de.ts`.
- The query-count budgets in `MemberIndexTest` and `EventIndexTest` hold: a
  filter is a `WHERE`, not a query.

## SPA

### One `SearchField`

A labelled `type="search"` input with a clear button, used by both screens.
The typed value becomes the query parameter after ~250 ms of quiet, and the
list query keeps its previous rows while the next ones load
(`placeholderData: keepPreviousData`), so typing never blanks the list into
"Chargement".

The search state lives in the component, like the day filter. Moving it to
the URL is a later, separate decision.

### `/members`

- The search field, then two selects: pupitre (every register, plus "Sans
  pupitre") and rôle (every role, by its translated label). Both default to
  "all".
- While any filter is on, the count reads "3 sur 45 membres": the matches out
  of the whole roster. The whole roster's count comes from a second, unfiltered
  read that is cached anyway.
- No match: a sentence saying so, and a button that clears every filter.

### `/events`

- The search field on its own row under the planning/past switch.
- The search joins the `scope` that holds "À répondre" still (#95): a new
  search re-partitions the blocks the same way choosing a day does, and data
  arriving does not.
- No match: its own sentence, distinct from "no events yet". The committee's
  "add a series" hint must not appear over a search that simply found
  nothing.

## Tests

- **PHPUnit**, per endpoint: each filter alone, filters combined, accent and
  case folding, wildcard escaping, an unknown id answering `[]`, each
  malformed value answering `validation_failed` with its reason, and the
  existing query-count tests unchanged.
- **Vitest**: the MSW handlers filter as the API does, and each screen is
  tested for typing, the selects, the no-match state and the count.
- **The PR carries screenshots** of both screens mid-search.
