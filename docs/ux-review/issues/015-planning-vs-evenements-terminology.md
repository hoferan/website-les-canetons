# Use one name for the planning section in the nav, title and links

**Labels:** ux, content, severity:low, effort:s

## Problem
For logged-in members the nav item reads "Événements", the page title reads "Planning" (DE "Planung"), the back links say "Retour au planning" and the counter says "Il reste 5 événements sans réponse". On the public side the equivalent is "Où nous voir" (nav) and "Où nous voir" (title), which is consistent. A member looking for "Planning" in the nav will not find it by that word.

## Evidence
- docs/ux-review/screenshots/player__events-fr-1280.png

## Guideline
Nielsen #4 and #2 (match with the real world); GOV.UK "use the same words as users".

## Proposal
Choose one word (the members already say planning) for the nav label and H1 in FR and DE; keep "événement" for the items. Check the DE nav label too (not captured in this review: the DE header nav was not read).

## Acceptance criteria
- [ ] Nav label, H1, document title (see 005) and back links use the same term in FR and DE
- [ ] Terminology list added to docs (i18n glossary)

## Dependencies
None
