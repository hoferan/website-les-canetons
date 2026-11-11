# Align button heights and horizontal padding to one value per size

**Labels:** ux, design-system, severity:low, effort:s

## Problem
Button variants are consistent (primary #4b2ed6, secondary white, accent #ffd23f, all with a 3 px ink border and 12 px radius), but the same size varies. Default-size primary buttons are 44 px tall with 16 px horizontal padding ("S’inscrire"), 12 px ("Ajouter une personne") and 20 px / 48 px tall / 16 px type ("Envoyer" on /contact). Secondary: 16 px ("Calendrier"), 20 px (footer "Contact", with a pink 4 px shadow) and 12 px ("Changer le mot de passe"). The hero buttons are 48 px, everything else 44 px. The pink vs ink hard shadow follows the dark vs light surface, which looks intentional.

## Evidence
- docs/ux-review/screenshots/components/button-primary-form-48.png
- docs/ux-review/screenshots/components/button-primary-booking-44.png
- docs/ux-review/screenshots/components/button-primary-44-pad12.png
- docs/ux-review/screenshots/components/button-accent-hero-48.png
- Data: docs/ux-review/data/components.json

## Guideline
Nielsen #4; Material 3 (one container height per size).

## Proposal
Define sizes sm 44 / md 44 / lg 48 with one horizontal padding each, set by the Button component (no per-call padding classes); keep the surface-dependent shadow.

## Acceptance criteria
- [ ] A computed-style scan of all buttons finds one (height, padding-x, font-size) triple per size
- [ ] Hero and form-submit buttons use size lg, everything else md
- [ ] /dev/ui shows the three sizes

## Dependencies
Related: #344 closed (one button system).
