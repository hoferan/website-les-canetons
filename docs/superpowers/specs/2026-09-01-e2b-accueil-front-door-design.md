# E2b — `/accueil` as a front door — Design

**Date:** 2026-09-01
**Status:** approved, not yet planned
**Part of:** E2. Build **after** E2a (`/canetons`, and the image rule) and before E2c.
**Builds on:** E1a, which taught `GET /api/events` what "upcoming" means — the one thing that makes the next-event block on this page correct by construction.

## The problem

`/accueil` is three things: the souper card, the words "Bienvenue sur notre
site", and one `PhotoPending` box. 1103px at 390px. The souper card is
flag-gated and describes an event in November 2027, so when that flag goes off
the front page is **a heading and an empty box**.

### It is faithful parity, not a regression

The legacy home page (`lescanetons.org`) was also a logo, a title, the navigation
and one welcome image, headed "Bienvenue sur notre site" with no paragraph under
it. It never said when the band was founded, what a Guggenmusik is, or who can
join. The SPA reproduced that exactly.

So improving this page is a **product decision**, not a bug fix, and it needs to
be argued rather than assumed.

### The constraint that shapes the answer

`CLAUDE.md` and the sub-project D decisions are explicit: **nothing factual is
invented.** Copy asserting when the band was founded or who may join cannot be
written here — it has to come from the band, like the 23 `à compléter` fields
already blocking PROD.

> **23, not 17.** `docs/continue-here.md` says "4 pages / 17 rendered fields" and
> tallies 8 committee names + 6 register rosters + 1 booking number + 2 joining
> contacts. That omits `/moniteurs`' six instructor placeholders, even though it
> lists Moniteurs as one of the four pages. Measured in a browser: `/canetons` 6,
> `/comite_teamdirection` 9, `/moniteurs` 6, `/commencement` 2 = **23**, from six
> `<Tbd>` call sites, several inside a `.map()`. The handover's own warning
> applies to its own number — count what renders, not what greps.

That appeared to block a real landing page. **It does not**, and checking rather
than accepting it is what changed this design.

## `/historique` already holds the facts

That page carries real prose, ported verbatim from the legacy site, with zero
placeholders. It states:

- the band was **officially created in October 2002** in Fribourg;
- it is a **"guggen d'enfants"** — a children's Guggenmusik;
- the players are aged **7 to 18**;
- **"Pas besoin de connaître la musique pour s'intégrer au groupe"** — verbatim;
- **moniteurs teach the pieces register by register**, at rehearsals **generally
  on Saturday morning**.

Those are exactly the facts a front door needs. Using them is a **condensation of
copy the band has already published**, which is a different act from writing new
claims. It still deserves their eyes once, but it is not blocked on them.

**One fact is deliberately NOT carried.** `/historique` says the band grew to
"une quarantaine d'enfants" — a sentence about 2002–03, not a current
membership count. Asserting it in the present tense would be both a new claim and
a perishable one. The hero copy omits the number entirely.

## The decision

### The hero

> **La guggen d'enfants de Fribourg, depuis 2002.**
>
> De 7 à 18 ans — et pas besoin de connaître la musique : les moniteurs
> apprennent les morceaux registre par registre, aux répétitions du samedi matin.

A short display line plus one supporting sentence, rather than a paragraph: the
first gives the Bungee display face something confident to set, the second keeps
the only practically useful information — Saturday mornings, no experience needed
— on the page where someone decides whether to turn up.

**No `tutoiement`.** `/commencement` says "Tu veux commencer la guggen ?" because
it addresses children directly; the members' area uses "vous". A front door is
read by both parents and children, so the copy stays impersonal — "pas besoin de
connaître la musique", the source's own phrasing — rather than inventing a
register shift on the site's most-read page.

### The page, in order

1. **The souper card** — unchanged, still flag-gated, still first. It is the most
   time-sensitive thing on the site while it is on.
2. **The hero** — the copy above.
3. **`PhotoPending`** — the photo slot, in E2a's slimmer form.
4. **"Prochain événement"** — the next upcoming event, read live from
   `GET /api/events`: its date, title, times and location, linking to
   `/planning_repet`.
5. **Four destination cards** — Nous rejoindre (`/commencement`), Les canetons
   (`/canetons`), Planning (`/planning_repet`), Contact
   (`/comite_teamdirection`).

### Why the next-event block is the part that earns its place

It is the only thing on the front page that changes by itself, and it is correct
**because of E1a**: before that change `GET /api/events` returned every event ever
in ascending order, so "the first event" was the oldest one in the database. A
next-event block built then would have advertised a concert from years ago. It is
now correct by construction.

It must **degrade to nothing**: no upcoming events, no block — not an empty card
and not "aucun événement". The page simply does not carry that section. The same
applies to the souper card when its flag goes off.

### Why not a paragraph the band writes later

The shape above is the same page as a full landing page **minus one paragraph**.
If the band later writes two or three sentences about themselves, they drop into
the hero's supporting slot and this becomes that page. Shipping a `<Tbd>` on the
front page instead — the most visible placeholder on the site — was rejected for
that reason: the destination is identical and this route does not put "à
compléter" in front of every visitor on the way there.

## Testing

| What | How |
| --- | --- |
| The hero copy renders | `Accueil.test.tsx` |
| The next-event block shows the first upcoming event's title, date and location | `Accueil.test.tsx`, against the MSW fixture |
| **With no upcoming events the block is ABSENT** — not empty, not a message | `Accueil.test.tsx` with an overridden handler returning `[]` |
| The four destination links point at the four routes | `Accueil.test.tsx` |
| The souper card still appears when the flag is on and vanishes when off | its existing coverage, unchanged |

The absent-when-empty test is the one worth writing carefully: an empty-state
card that says "no upcoming events" on a band's front page reads as "this band
does nothing", which is worse than the section not being there.

**Look at the page**, at 390px and 1280px, in all three states — anonymous,
member, admin — and with the souper flag both on and off. E1 shipped four defects
a green suite could not see.

## What this deliberately does not do

- **No `<Tbd>` is added or filled.** PROD stays blocked on content.
- No change to the nav, the souper card's contents, or `/historique` itself.
- No hero photograph is added — the slot is `PhotoPending` until the band
  re-shoots, exactly as on `/canetons`.
- No change to `GET /api/events`; this page is a new consumer of it, nothing more.

## Risks

**The front page gains a live dependency.** If `/api/events` is slow or fails,
`/accueil` must still render — the next-event block is additive and its loading
and error states must never block the hero or the destinations. This is the one
place where a failure would be most visible.

**Four destination cards duplicate the nav.** Deliberately: the nav is a list of
every page, and this is a short list of the four a stranger most likely wants.
If the two drift, the nav is the source of truth for *existence* and this is a
curated subset — which is worth stating in the component so nobody "fixes" it by
generating the cards from `NAV`.
