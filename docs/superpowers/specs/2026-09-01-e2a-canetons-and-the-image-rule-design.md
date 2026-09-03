# E2a — `/canetons`, and the image rule — Design

**Date:** 2026-09-01
**Status:** approved — implemented by `docs/superpowers/plans/2026-09-03-e2a-canetons-and-the-image-rule.md`
**Part of:** E2, which is three rounds — E2a (this), E2b (`/accueil` as a front door), E2c (feedback motion and one spacing scale). Build in that order.
**Builds on:** E1 (`c7b95fe`, PR #63), which shipped the phone pass and deliberately did not touch `PhotoPending`'s shape so this decision stayed open.

## The problem, measured

`/canetons` is **3034px tall at 390px** — about 3.6 phone screens. Eight dashed
`PhotoPending` boxes at 160px each account for **1280px of that, 42%**. Six
registers additionally read "à compléter : prénoms du registre". There is exactly
one real photograph, at the very bottom. Roughly 90% of the page is a promise of
content rather than content.

The obvious reading — "the placeholders made the page too long" — is **wrong**,
and getting this backwards would produce the wrong design.

### One photo per register is a carried requirement

The legacy site (`lescanetons.org/canetons.php`) has seven registers, each
rendered as heading → one photograph → a caption naming the members. The
photographs are coming back. So the page must be designed for its
**photographed** state, with the placeholder period as a transient.

Two consequences follow, and both were measured rather than assumed:

**The caption is keyed to the photo.** The legacy captions read "De gauche à
droite : …", and note standing versus front rows. The roster is not an
independent list; it is a reading key for the image. Anything that separates them
— for example acknowledging the missing photos once for the whole section —
breaks the caption's meaning. That is why it was rejected.

**The photographed page is LONGER than the placeholder page.** At 390px the
content column is 358px. A 3:2 photo is then 239px tall, so a register costs
about 364px with its heading, caption and spacing. Seven registers plus the hero
photo and the parrain/marraine card come to roughly **3554px**, against today's
3034px. The length is inherent to the requirement, not a defect to remove.

### What the legacy images actually weigh

| file | weight | pixels | shape |
| --- | --- | --- | --- |
| 6 registers + hero | 2.3–2.8 MB each | 1920×1277 | 3:2 landscape |
| `lyre.jpg` | 2.5 MB | 1277×1920 | **portrait** — the odd one out |
| `directionmusicale.jpg` | **19.8 MB** | 6048×4024 | camera original |
| **total** | **37.5 MB** | | for eight images on one page |

`CLAUDE.md` already names that 19.8 MB / 6048×4024 file as the reason the image
budget exists, and the budget is documented there: longest edge 1920px, JPEG
quality 82, progressive, no EXIF, roughly 300–600 KB each. Re-encoded, these
eight land at about 3–5 MB total.

## The decision

### 1. A register index

A `RegisterIndex` component renders a row of jump links — Direction · Batteurs ·
Grosses-caisses · Lyre · Cloches · Trompettes · Trombones — above the register
list. Each register section gains a stable `id`; the links anchor to it.

This is the only change that makes a long page **navigable** rather than
shorter, and it works identically whether the photos are present or pending. A
long page is the correct shape for "here is every section of the band, with a
photo of each"; what it lacked was a way in.

Rejected alternatives, and why:

- **Two registers side by side above `md`.** Halves the page on desktop, where
  3.5k pixels was never the problem, and does nothing on the phone, where it is.
  The portrait `lyre` would also make uneven rows.
- **Collapsing each register into a disclosure.** Hides the band behind taps on
  the one page whose job is to introduce them, and re-uses a pattern that on this
  site already means "this is the archive" (`/planning_repet`'s past events).

### 2. `PhotoPending` becomes one line

The component drops from a 160px-minimum box to a single line of text, keeping
its dashed treatment and its `data-photo-pending` hook. Eight of them then cost
roughly 280px instead of 1280px.

The photographed layout is unaffected — this changes only what an *absence*
costs. It is also the treatment `/accueil` and `/moniteurs` inherit, so all three
pages stay consistent.

`PhotoPending`'s `what` prop and its "names what is missing" behaviour are
unchanged; so is its docblock's reasoning about why every photograph went at once.

### 3. Photos keep their natural aspect ratio

No uniform `aspect-ratio` + `object-fit: cover`. A uniform 3:2 would look tidier
and save about 300px, but the source photographs are group shots and the
captions read "de gauche à droite" — **a crop can cut a person out and make the
caption wrong.** The portrait `lyre` therefore renders 538px tall at 390px, and
that is accepted.

### 4. `tools/image-budget.mjs`

A guard, modelled on `tools/secret-guard.mjs` and wired into `npm run check`
alongside it. It walks `web/public/assets/img/` and fails, naming the offending
file, when an image exceeds the documented budget:

- longest edge greater than 1920px, or
- file size greater than 600 KB.

**Exempt, by name, with the reason in the file:** the logo, `CD_img.png`,
`comite.jpg` and `Flyer.jpeg`. `CLAUDE.md` records that these are deliberately
left alone because they are already small and re-encoding a small image only
softens it. Re-encoding is generational, so the guard must never encourage a
second pass over already-optimised files.

**Why this belongs in E2a rather than "later".** The budget exists today only as
prose in `CLAUDE.md`, which says in as many words that nothing in the test suite
or the linters can catch an unprocessed original being dropped in. The legacy
site is still serving a 19.8 MB original, and the band is about to re-shoot eight
photographs and hand them over. This guard is what stops 37.5 MB arriving in the
repository, and it is worth more than the layout change it ships beside.

It reads image dimensions from the file header — the same JPEG/PNG header parse
used to measure the legacy files for this spec — rather than adding an image
library. This project has no runtime dependencies by design and should not gain a
build-time one for a size check.

## Testing

| What | How |
| --- | --- |
| The index renders one link per register, in the NAV's order | `RegisterIndex.test.tsx` |
| Each link's `href` matches a real section `id` on the page | `Canetons.test.tsx` — the assertion that catches a renamed anchor |
| `PhotoPending` still names what is missing, and keeps `data-photo-pending` | its existing tests, unchanged |
| The budget guard fails an oversized file and passes the current tree | `tools/image-budget.test.mjs`, via `node:test` like `build-overlays.test.mjs` |
| The exemption list is honoured | same |

**A page-height assertion is deliberately NOT added.** It would pin a number that
every legitimate content change alters, and it would not have caught any defect
this project has actually had. The height claims in this spec are measurements
taken to make a decision, not acceptance criteria.

**Look at the page.** E1 shipped four defects that a green suite could not see;
`docs/continue-here.md` records them. The index and the slimmed placeholder both
have to be read at 390px and 1280px before this is called done.

## What this deliberately does not do

- **No `<Tbd>` is filled in.** The six "à compléter : prénoms du registre" stay.
  **PROD remains blocked on content**, which this does not change.
- **No photographs are added.** The band has to re-shoot them. This makes the
  page ready for them and makes it safe to hand them over.
- No change to the register set, their order, or their headings — all carried
  from the legacy site deliberately.
- `/accueil` and `/moniteurs` inherit the slimmer `PhotoPending` and are otherwise
  untouched here; `/accueil` is E2b.

## Risks

**The index is dead weight if the page is short.** With photos it is not — it is
a 3.5k page. Without them, after the placeholder slims, the page is ~1900px and
the index earns less. It is still correct at both lengths, and the photographed
state is the one being designed for.

**The guard could block a legitimate large image.** The exemption list is by
name, in the file, with a reason required beside each entry — the same shape as
`routes.tsx`'s commented-out routes. A new exemption is a deliberate, reviewable
act rather than a threshold nudge.
