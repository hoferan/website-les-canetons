# Fix heading levels: event titles under section headings, form section legends

**Labels:** ux, a11y, severity:medium, effort:s

## Problem
On /events the section headings ("À répondre", "Brouillons", "Le reste du planning") are h2 and so are the event titles beneath them, so the outline is flat (h1, h2 "À répondre", h2 "Répétition", h2 "Répétition + apéritif de Noël", …). On /agenda and the home agenda block the outline goes h1, h3 (no h2); on /events/7/book the visible section titles "Vos coordonnées" and "Votre choix" are legends, and the only heading inside is an h3 "Pour la cuisine". On /history each timeline entry is one h2 containing the label, date and title together ("Étape importante : octobre 2002 Les débuts").

## Evidence
- docs/ux-review/screenshots/player__events-fr-1280.png
- docs/ux-review/screenshots/anon__events_7_book-fr-1280.png
- Data: docs/ux-review/data/merged.json (heads)

## Guideline
WCAG 1.3.1 Info and Relationships, 2.4.6 Headings and Labels; GOV.UK headings guidance.

## Proposal
Event titles become h3 under the section h2 on /events; /agenda uses h2 for each event or a visually hidden h2 "Prochains événements"; keep legends for fieldset groups but make the h3 on the booking form an h2 or a legend consistently; split the history entry heading so only the title is the heading and the date is a `time` element outside it.

## Acceptance criteria
- [ ] No heading level is skipped on any route in pages.json (axe rule heading-order plus a custom check that h3 never follows h1)
- [ ] Screen reader heading list for /events reads sections, then events beneath
- [ ] FR and DE identical structure

## Dependencies
None
