# Extract one Surface (card) component and retire radius/border/shadow drift

**Labels:** ux, component, severity:medium, effort:l

## Problem
Bordered panels use three radii, two border widths and three shadow depths with no visible rule. At 1280 px: list cards (events, members, roles, registers) are radius 18 px, 2 px border, no shadow. Home tiles and the booking/contact form panel are radius 18-20 px, 3 px border and a 5 px hard shadow; the role/series editors use a dashed, shadowless panel; the registrations cards are 2 px with no shadow but narrower padding. Across the audit, 47 distinct surface signatures were counted for what reads as four kinds of panel.

## Evidence
- docs/ux-review/screenshots/components/card-event-list.png
- docs/ux-review/screenshots/components/card-home-tile.png
- docs/ux-review/screenshots/components/card-role.png
- docs/ux-review/screenshots/direction__roles-fr-1280.png
- docs/ux-review/screenshots/anon__events_7_book-fr-1280.png
- Data: docs/ux-review/data/components.json (kind=surface)

## Guideline
Nielsen #4; Material 3 cards (elevated/filled/outlined as named variants); GOV.UK "summary card" vs "inset text" (one component per purpose).

## Proposal
**Surface** (layout primitive). Responsibility: draw a bounded region. Not: lay out its content, not a link target by itself.

API: `<Surface as="div|article|li|section|form" variant="list|feature|form|placeholder" padding="md|lg" tilt?>`. `list` = 2 px border, no shadow; `feature` = 3 px border + 5 px hard shadow (home tiles); `form` = 3 px border + 3 px shadow (booking, contact, login); `placeholder` = dashed, shadowless (new role, add block). One radius token for all variants.
States: default; `interactive` adds hover/focus ring when the whole surface is a link.
a11y: renders the chosen element so `article`/`li` semantics survive; if interactive, exactly one link inside provides the accessible name (no nested interactive elements).
Separation of concerns: the home tile and the Planning row currently mix surface, content and actions; the row's actions belong to the action bar of #379-#383, not to Surface.
Dependencies: none; used by StateMessage panels.

## Acceptance criteria
- [ ] Surface exists with four variants and appears in /dev/ui
- [ ] Radii in use on bordered panels reduce from 12/14/16/18/20 px to one value
- [ ] List, tile and form panels on /events, /members, /roles, /registers, /, /contact, /events/:id/book render through it, with no visual change except the intended alignment
- [ ] Interactive tile: keyboard focus ring is visible and >= 3:1; Tab order unchanged
- [ ] FR and DE at 375 and 1280 px, no overflow

## Dependencies
Blocks: 014. Split into two PRs if it exceeds roughly 400 changed lines: lists first, home tiles and form panels second.
