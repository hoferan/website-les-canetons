# 0024. Lay out every list as cards, at every width

Status: Accepted, 2026-09-18

## Context

Four list screens (`/members`, `/contact-messages`, `/events/{id}/attendance` and
`/events/{id}/registrations`) rendered a card list below the `md` breakpoint and a
table above it, both present in the DOM. The two drifted: the guest list's table lacked
the address column for its whole life, with a green suite over it (#98).

Issue #130 had decided to keep the tables, for scanning columns, for guest lists of 60
to 80 rows, and for screen readers' table navigation.

## Decision

André reversed #130 on 2026-09-18 (#146). Every list is cards, in a grid that widens
with the screen, and there is one layout at every width. A card field whose meaning is
not obvious from its value carries a visible label.

`web/src/pages/oneLayoutPerRow.test.ts` fails any page that pairs a phone-only layout
with a desktop-only one.

## Consequences

Column alignment and the screen reader's table mode are gone. The accessibility cost is
noted on #15.

`components/ui/table.tsx` was deleted, and new list screens start from cards.
