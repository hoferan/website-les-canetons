# Document and enforce the radius, shadow and type-size scales

**Labels:** ux, design-system, severity:low, effort:m

## Problem
Colour is tight: 16 distinct text colours and no near-duplicate greys (ink #14121c, muted #5a5768, white, 70% white, brand and tag colours); the near-duplicates are the two near-blacks (surface #0b0a12, ink #14121c) and two reds (#e0201a and Tailwind red-700, see 003). Other scales are looser. Counted over 292 page renders (73 route/locale pairs at 4 widths): font sizes 8, 10, 11, 12, 13, 14, 16, 18, 20, 24, 30, 36, 48, 96, 128 px (14 px on about 7,500 text runs, 13 px on about 1,550, which is nav links in Bungee); radii 4, 6, 8, 12, 14, 16, 18, 20 px plus pill; hard shadows 2 (ring), 3, 4 (pink) and 5 px; spacing includes 6, 10, 14 px between the 4/8/12/16/20/32 steps. The logo tagline "Guggenmusik" under the wordmark is 11 px, letter-spaced, 70% white on near-black.

## Evidence
- docs/ux-review/data/tokens.json
- REPORT.md section Token inconsistencies

## Guideline
Material 3 type scale and shape scale; Nielsen #4.

## Proposal
Write the scales into `@theme` as named tokens (type: 12/14/16/18/24/30/48; radius: sm 6, md 12, lg 18, pill; shadow: ring, hard-sm 3, hard-lg 5), replace stray values, and add a lint or Playwright scan that fails on an unlisted computed size, radius or shadow. Raise the 11 px tagline to 12 px.

## Acceptance criteria
- [ ] Every computed font-size, radius and box-shadow on the audited routes belongs to the documented scale (scan script committed under tools/)
- [ ] Tokens visible in /dev/ui
- [ ] No visual regression on the screenshot sweep (npm run screenshots) beyond intended alignments

## Dependencies
Blocked by: 001, 002 (their variants decide the radius and shadow set).
