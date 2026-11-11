# Extract one Badge component for tags, visibility and account status

**Labels:** ux, component, severity:medium, effort:m

## Problem
Small status pills are built three ways. Measured across 36 instances on /events, /members, /event-tags, /registrations at 1280 px, FR: 17 distinct computed-style signatures. Heights 20, 24 and 26 px; font 12 px/600 ("Jamais utilisé", "Provisoire" on a #ff3d9a fill), 14 px/400 (event category tags, "Public") and 14 px/500 ("Brouillon"); "Public" is 400 weight grey on white while "Brouillon", the same outline pill, is 500 weight near-black. The only pink pill is an alert-like state, but pink is also the brand accent, so a status colour carries no stable meaning.

## Evidence
- docs/ux-review/screenshots/components/badges-events-fr-1280.png
- docs/ux-review/screenshots/components/badge-never-used.png
- docs/ux-review/screenshots/components/badge-draft-or-tag.png
- docs/ux-review/screenshots/direction__members-de-375.png
- Data: docs/ux-review/data/components.json (kind=badge)

## Guideline
Nielsen #4 (consistency and standards); Material 3 "Assist/Filter chip" vs "Badge" separation; WCAG 1.4.1 (meaning not by colour alone; every pill here does carry text, keep it that way).

## Proposal
**Badge** (primitive, display only). Responsibility: label a thing with a short status or category. Not: filter/toggle (that stays a button), not a count bubble (the avatar's notification dot is a separate Indicator).

API: `<Badge tone="neutral|tag|attention|success|danger" size="sm|md" tint?="#hex from tag palette" icon?>children</Badge>`. One font spec per size (proposal: sm 12/600, md 14/500). `tone="tag"` takes the event tag's tint pair and guarantees text/background >= 4.5:1; `attention` replaces the pink fill.
States: static only; no hover/focus. a11y: text always present, never colour only; decorative icon `aria-hidden`; no `role=status`.
Dependencies: none. Dependents: Planning rows, Members rows, Registrations cards, Event tags editor.
Adoption: replace every pill listed above in the same PR; add a Badge section to /dev/ui.

## Acceptance criteria
- [ ] Badge exists with the tones and sizes above and appears in /dev/ui
- [ ] Every pill on /events, /members, /event-tags, /events/:id/registrations renders through it; a computed-style scan finds at most 4 pill signatures (md and sm times tone) instead of 17
- [ ] Each tone/tint pair measures >= 4.5:1 text contrast (Playwright check on a real build, not Vitest, per ADR 0002)
- [ ] "Public" and "Brouillon" share one weight
- [ ] FR and DE, 375 and 1280 px: no pill wraps or clips ("Provisorisch", "Nie benutzt")

## Dependencies
Blocks: 014
