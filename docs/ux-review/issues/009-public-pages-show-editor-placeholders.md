# Stop showing editor instructions and empty photo placeholders to visitors

**Labels:** ux, content, severity:medium, effort:s

## Problem
Anonymous visitors on /band see an internal instruction as body text under two registers: "… à compléter sur la page Membres : prénoms du registre" (Grosses-caisses, Lyre). The same page and the home page show "Photo à venir" with a camera icon seven times (six times on /band: Batteurs, Grosses-caisses, Lyre, Cloches, Trombones and the godparent block; once on /). To a visitor these read as an unfinished site; the first is an admin instruction on a public page.

## Evidence
- docs/ux-review/screenshots/anon__band-fr-1920.png
- docs/ux-review/screenshots/anon__home-fr-1280.png

## Guideline
Nielsen #8 (aesthetic and minimalist design), #2 (match with the real world); GOV.UK content design (no placeholder text in production).

## Proposal
For visitors: omit an empty photo slot entirely (no placeholder) and omit a register's empty member line. Show the editor hint and the "Photo à venir" slot only to users holding the edit permission, in edit mode (this is the existing pencil/chip pattern).

## Acceptance criteria
- [ ] Anonymous /band and / render no "Photo à venir" and no "à compléter" text, FR and DE
- [ ] A user with content.manage still sees the hint where data is missing
- [ ] No layout jump when the photo arrives (see 011)
- [ ] Playwright test asserts the strings are absent for anonymous users

## Dependencies
Overlaps #106 (open): the public site still needs photographs. This issue is about what visitors see until then.
