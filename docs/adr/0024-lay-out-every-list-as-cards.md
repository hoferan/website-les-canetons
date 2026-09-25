---
status: accepted
date: 2026-09-18
decision-makers: André Hofer
---

# Lay out every list as cards, at every width

## Context and Problem Statement

Four list screens (`/members`, `/contact-messages`, `/events/{id}/attendance` and
`/events/{id}/registrations`) rendered a card list below the `md` breakpoint and a
table above it, both present in the DOM. The two drifted: the guest list's table lacked
the address column for its whole life, with a green suite over it (#98).

Issue #130 had decided to keep the tables, for scanning columns, for guest lists of 60
to 80 rows, and for screen readers' table navigation.

Should list screens keep a table above `md`, or use one layout at every width?

## Considered Options

- Cards at every width
- Keep the tables above `md`, as #130 decided

## Decision Outcome

Chosen option: "Cards at every width", because the two layouts of the same list drifted
apart with a green suite over them (#98).

André reversed #130 on 2026-09-18 (#146). Every list is cards, in a grid that widens
with the screen, and there is one layout at every width. A card field whose meaning is
not obvious from its value carries a visible label.

### Consequences

- Good, because there is one layout per list, so a column cannot go missing from one
  of two copies.
- Bad, because column alignment and the screen reader's table mode are gone. The
  accessibility cost is noted on #15.

`components/ui/table.tsx` was deleted, and new list screens start from cards.

### Confirmation

`web/src/pages/oneLayoutPerRow.test.ts` fails any page that pairs a phone-only layout
with a desktop-only one.

## Pros and Cons of the Options

### Keep the tables above `md`, as #130 decided

- Good, because a table is better for scanning columns.
- Good, because it suits guest lists of 60 to 80 rows.
- Good, because screen readers can use table navigation.
- Bad, because the card list and the table drifted: the guest list's table lacked the
  address column for its whole life, with a green suite over it (#98).
