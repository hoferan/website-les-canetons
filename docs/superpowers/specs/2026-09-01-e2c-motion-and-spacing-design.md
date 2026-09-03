# E2c — feedback motion, and one spacing scale — Design

**Date:** 2026-09-01
**Status:** approved, not yet planned
**Part of:** E2. Build **last** — after E2a (`/canetons`) and E2b (`/accueil`).

## Why last

A vertical spacing scale applied to `/accueil` and `/canetons` immediately before
those pages change shape is work done twice. E2b in particular rebuilds the front
page. So this round comes after both, and applies one scale to pages that have
settled.

## The problem

### Spacing is improvised

`web/src/` uses **ten distinct `mt-*` values** across 94 occurrences —
`mt-1` (12), `mt-2` (13), `mt-3` (9), `mt-4` (25), `mt-5` (2), `mt-6` (19),
`mt-8` (8), `mt-10` (4), `mt-12` (1), `mt-16` (1) — plus six distinct
`space-y-*` values. Nothing decides which to use, so each page picks by eye and
similar things are spaced differently on different pages.

This is not a visible defect anyone has reported. It is the reason two pages that
should feel alike do not, and it gets worse with every page added.

### There is no feedback motion at all

Nothing on the site acknowledges an interaction in time. A button press, the
phone menu opening, the past-events disclosure expanding and a toast arriving all
happen instantly, which on a phone reads as "did that work?" — particularly the
disclosure, which changes the page's height with no transition.

## The decision

### 1. One vertical scale

Four steps, defined as `@theme` tokens in `web/src/styles.css` beside the
existing `--container-*` and `--spacing-touch` tokens, and documented there:

| step | value | for |
| --- | --- | --- |
| tight | `0.5rem` | a label to the thing it labels |
| related | `1rem` | items within one block |
| block | `2rem` | between blocks inside a section |
| section | `4rem` | between major sections of a page |

Pages use these instead of choosing a number. The four names describe
**relationships**, not sizes, which is what makes them decidable: the question
"is this a label or a section?" has an answer, where "is this `mt-3` or `mt-4`?"
does not.

**This is a convention, not a lint rule.** No check forbids a raw `mt-*` — such a
rule would fire on the vendored shadcn components, which are not ours to restyle,
and on legitimate one-offs. The scale is documented in `styles.css` and applied
where pages currently improvise.

`mt-16` on the footer and the `PageSection` widths stay as they are; they were
decided in E1 with reasons recorded.

### 2. Motion only as feedback

Motion is added in exactly four places, each because it reports that something
happened:

| where | what |
| --- | --- |
| `Button` | a press state — a short scale or background transition |
| the phone nav panel | the open/close reveal, which currently snaps |
| `/planning_repet`'s past-events disclosure | the height change, which currently jumps |
| the toast | its arrival, which sonner already animates — verify, do not re-implement |

Durations stay short — in the 120–200ms range — because the purpose is
acknowledgement, not decoration.

**Everything sits behind `prefers-reduced-motion`.** A `@media (prefers-reduced-motion: reduce)`
block sets the durations to zero. This is not optional politeness: the band's
audience includes children and the members' area is used one-handed outdoors.

### 3. What is explicitly rejected

**Entrance animation** — content fading or sliding in on load or on scroll. It is
the most common way a site starts feeling slow, because it delays content the
reader has already asked for, and this site is read on phones outdoors at
rehearsals. Rejected on those grounds, not on taste.

**Page-transition animation** between routes. Same reasoning, plus it would fight
the SPA's instant navigation, which is currently one of the better things about
it.

## Testing

Motion is close to untestable in jsdom, and pretending otherwise produces tests
that assert class names and catch nothing. So:

| What | How |
| --- | --- |
| The reduced-motion block exists and zeroes the durations | `web/src/styles.css` is asserted in the **built CSS**, the way E1 verified `min-h-touch` and `focus-ring` — grep `dist/build/assets/*.css` for `prefers-reduced-motion` |
| The four spacing tokens generate real utilities | same method: build, then grep the built CSS. **An unknown Tailwind class is inert, not an error** — E1 learned this twice |
| No existing test changes | the whole suite must pass untouched; this round adds no behaviour |

**The verification that matters is watching it.** Open the phone menu, expand the
disclosure, press a button, trigger a toast — at 390px, with reduced motion off
and then on. A duration that feels wrong is not something a test can tell you,
and a transition that does not respect reduced motion will pass every assertion
in the suite.

## What this deliberately does not do

- No entrance, scroll or page-transition animation.
- No lint rule against raw `mt-*`.
- No change to the palette, the display face, or `PageSection`'s widths — all
  settled earlier with reasons recorded.
- No `<Tbd>` filled. **PROD stays blocked on content.**
- The French inconsistencies (`Nom:` versus `Nom :`, "Liens Amis") are **not**
  settled here. They were ported deliberately and belong in the band's open
  questions, not in a motion round.

## Risks

**A spacing scale is a large diff with no visible feature.** It touches many
files to change nothing a user can name, which makes it the round most likely to
introduce a stray regression for no credit. Mitigation: apply it page by page,
and require the suite to pass untouched at each step — the same checkpoint
structure E1b used for its 35-shell refactor, which is what proved that refactor
had not overreached.

**Motion is subjective and easy to overdo.** The four places above are a closed
list. Adding a fifth is a new decision, not an extension of this one.
