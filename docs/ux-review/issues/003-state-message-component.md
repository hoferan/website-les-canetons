# Create a StateMessage component for loading, empty and error states

**Labels:** ux, component, severity:medium, effort:m

## Problem
Async states on a list screen are bare text. With the events request held for 4 s on /events (FR, 375 and 1280 px), the area under the filters shows only "Chargement…" (role=status) and nothing else; with it failing, "Le planning n’a pas pu être chargé." appears as a lone `role=alert` paragraph with no Réessayer action (the only buttons left on the page are the view and category filters); the empty state is a single sentence "Aucun événement au planning." with no next step. The error paragraph is also a different red (Tailwind red-700, oklch 0.505 0.213 27.5, about #b91c1c) from the red used for field errors and required asterisks (#e0201a).

## Evidence
- docs/ux-review/screenshots/state-events-slow-fr-375.png
- docs/ux-review/screenshots/state-events-error-fr-375.png
- docs/ux-review/screenshots/state-events-empty-fr-375.png
- Data: docs/ux-review/data/interact2.json, interact3.json

## Guideline
Nielsen #1 (visibility of system status) and #9 (help users recover from errors); GOV.UK error summary; Baymard on recoverable errors.

## Proposal
**StateMessage** (composite). Responsibility: say what state a region is in and offer the next action. Not: fetching (it takes the query's state as props), not toast notifications.

API: `<StateMessage state="loading|empty|error" title? description? action?={{label,onClick}} />` plus `retry` shorthand wired to the query's refetch. Loading shows a skeleton the size of the expected content (see 011) with `role=status` and a text label; error uses `role=alert`, the app's one error colour and always a Réessayer button; empty accepts a primary action (for example Ajouter).
States covered: loading, empty, error, error-while-refetching (keeps stale data, shows inline notice).
a11y: loading text announced once (polite); error announced (assertive); the retry button receives focus only when the user triggered the load.
Dependencies: Button, Surface (optional), the Notice levels from #376.

## Acceptance criteria
- [ ] Component and its three states in /dev/ui, FR and DE copy for every string (ApiErrorVocabulary rules unaffected)
- [ ] Error state has a working Réessayer; clicking it refetches and, on success, replaces the error without a page reload
- [ ] Error colour equals the field-error colour
- [ ] Axe finds no violations in any state
- [ ] Verified with a forced-slow, forced-500 and forced-empty events request at 375 and 1280 px

## Dependencies
Blocks: 004, 014
