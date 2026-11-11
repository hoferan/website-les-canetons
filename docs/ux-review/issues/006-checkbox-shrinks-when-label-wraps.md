# Stop checkboxes shrinking to 13-19 px when their label wraps

**Labels:** ux, a11y, severity:medium, effort:s

## Problem
On /roles the 15 permission checkboxes measure 13x20 to 20x20 px at 375 px (18, 14, 19, 14, 16, 19, 20, 17, 17, 16, 13, 19, 20, 14, 20) and 14-20 px wide at 1280 px. The box is squeezed by its wrapping label, so "Modifier les textes du site" shows a visibly smaller box than its neighbours. At 13 px it is below the WCAG 2.2 minimum target size, and misaligned with the label text.

## Evidence
- docs/ux-review/screenshots/components/checkbox-shrink-roles-fr-375.png
- docs/ux-review/screenshots/direction__roles-fr-1280.png

## Guideline
WCAG 2.5.8 Target Size (Minimum) AA, 1.4.11 Non-text contrast; Nielsen #4.

## Proposal
Give the checkbox a fixed 20x20 px box that cannot shrink (`shrink-0`, explicit width/height), align it to the first label line, and keep the whole label row as the click target (>= 44 px tall on touch).

## Acceptance criteria
- [ ] All checkboxes on /roles, /members editor, /events/new measure 20x20 at 375, 768 and 1280 px, FR and DE
- [ ] Row height >= 44 px
- [ ] Same check for radios in the booking form (measured 20x20; keep)

## Dependencies
None
