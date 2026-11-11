# Adopt StateMessage on every screen that loads a list

**Labels:** ux, design-system, severity:medium, effort:m

## Problem
Only /events was measured end to end in the loading, empty and error states, and it lacks a retry (see 003). The same pattern is expected on /members, /inbox, /contact-messages, /event-tags, /registers, /roles, /media, /events/:id/attendance and /events/:id/registrations. Verify each, then migrate; do not assume.

## Evidence
- docs/ux-review/screenshots/state-events-error-fr-375.png
- Method: fetch override per route, see docs/ux-review/scripts/interact2.mjs

## Guideline
Nielsen #1, #9.

## Proposal
For each listed screen, force slow, empty and failing responses; record the current behaviour in the PR description; replace with StateMessage. Screens that already show a good retry keep their copy but move to the component.

## Acceptance criteria
- [ ] Each listed screen shows a skeleton or loading label, an empty message with a next action where one exists, and an error with Réessayer
- [ ] FR and DE copy present for all three states on every screen
- [ ] Keyboard-only: after an error the retry button is reachable in one Tab from the filters
- [ ] No screen shows "Chargement…" forever after the request has failed

## Dependencies
Blocked by: 003
