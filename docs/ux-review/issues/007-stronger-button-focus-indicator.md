# Strengthen the keyboard focus indicator on buttons

**Labels:** ux, a11y, severity:medium, effort:s

## Problem
Keyboard focus on a primary button (/contact, Envoyer, 1280 px) is a 3 px ring of the brand indigo at 50% alpha plus a border colour change from near-black to indigo. Computed from the rendered colours, the ring is about 2.55:1 against a white card and 2.51:1 against the cream page, below the 3:1 non-text contrast. The border change also removes the button's dark outline, so the focused button looks lighter, not more prominent. Nav links on the dark header (2 px white outline) are fine.

## Evidence
- docs/ux-review/screenshots/components/focus-submit-kbd-fr-1280.png
- docs/ux-review/screenshots/components/focus-input-kbd-fr-1280.png
- Computed: box-shadow 0 0 0 3px oklab(0.46 0.04 -0.23 / 0.5)

## Guideline
WCAG 1.4.11 Non-text Contrast (AA), 2.4.7 Focus Visible (AA), 2.4.11 Focus Not Obscured; Apple HIG focus ring guidance.

## Proposal
Use a solid 3 px ring with 2 px offset in ink (#14121c) on light surfaces and white on dark surfaces; keep the hard shadow unchanged; apply to every Button variant and to inputs.

## Acceptance criteria
- [ ] Focus indicator measures >= 3:1 against the page and the card behind it, for primary, secondary, accent buttons
- [ ] Visible on keyboard focus only (focus-visible), not on mouse click
- [ ] Same indicator on inputs, selects, textareas, switches and links
- [ ] Checked on cream, white, yellow and dark footers

## Dependencies
None
