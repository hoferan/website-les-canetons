# Give standalone links like "← Retour au planning" a 44 px target

**Labels:** ux, a11y, severity:low, effort:s

## Problem
The standalone back link "← Retour au planning" measures 139x17 px on /events/7/registrations and /events/1/attendance and 139x20 px on /events/7/book/edit (375 px, FR; same in DE). Email and phone links on the registration cards are 32 px tall. Desktop nav links are 27 px tall. The 17 px links fail the 24 px minimum; the others pass AA but not the 44 px recommendation. Other measured targets: buttons, the menu button, the language switch and text inputs are >= 44 px; switches are 44x24 (pass AA); checkboxes and radios are 20x20 inside a larger label (see 006). The skip link is 1x1 until focused, which is correct.

## Evidence
- docs/ux-review/screenshots/flow-registrations-fr-1280.png
- Data: docs/ux-review/data/merged.json (small)

## Guideline
WCAG 2.5.8 Target Size Minimum (AA, 24 px) and 2.5.5 (AAA, 44 px); Apple HIG 44 pt; Material 3 48 dp.

## Proposal
Add vertical padding to standalone links (min-height 44 px on touch, `inline-flex items-center`); keep inline links in prose as they are.

## Acceptance criteria
- [ ] At 375 px every standalone link measures >= 44 px in height and at least 24 px at any width (scan)
- [ ] No change to the visual rhythm on desktop

## Dependencies
None
