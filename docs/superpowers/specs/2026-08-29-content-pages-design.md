# The nine content pages — design

**Date:** 2026-08-29
**Branch:** `feat/spa-cutover`
**Status:** approved, ready for a plan

Sub-project **A2**, the second half of A. **A1 — the visual foundation — is
done**, so these pages land on an existing design system rather than on nothing:
`docs/superpowers/specs/2026-08-29-visual-foundation-design.md` has the palette,
the two faces and the chrome.

When this ships, **seven routes remain on `Placeholder`**: the four of the
members' area (C — `sinscrire`, `inscriptions_utilisateurs`, `admin`,
`inscriptions_admin`) and the three flag-gated souper routes (D).

## What these pages are

Nine routes, none of which touch the API. They are markup, photographs and
French copy, ported from `git show dcd7862^:app/pages/<page>.php`.

They fall into three shapes, and the plan is structured around them because the
work inside each shape is the same work repeated:

| Shape | Pages | What it is |
| --- | --- | --- |
| **Prose** | `historique`, `cd`, `sponsors`, `multimedia`, `accueil` | Headings, paragraphs, link lists. One external `<iframe>`. |
| **Photo** | `canetons`, `moniteurs` | A photograph per section with a roster caption. `canetons` has **seven** sections — one per register. |
| **Structured** | `comite_teamdirection`, `commencement` | A committee card grid, an information grid, contact details, a downloadable flyer. |

## Decisions

### The souper CTA on `/accueil` belongs to sub-project D

`accueil.php` has two halves. The static one is three lines — a heading and a
photograph. The other is a feature-flagged call-to-action reading
`SignupRepository::OCCASIONS[ACTIVE_OCCASION]` and branching on
`Auth::canViewSummary()`.

That CTA is **portable today**: `GET /api/config` already returns `occasion`
with exactly the fields it used — `title`, `subtitle`, `dateDisplay`, `teaser`,
`invitation` — and the SPA's `can("view_summary")` mirrors the old guard.

It is still deferred to **D**, for one reason: its two buttons link to `/signup`
and `/signups_admin`, which are D's routes and are `Placeholder` today. A
call-to-action that lands on a placeholder is worse than no call-to-action. The
flag is off by default, so nothing is visibly missing in the meantime, and D
builds the CTA and its destinations together.

**A2 ports only the static half of `/accueil`.**

### The France 3 embed becomes `https://`

`multimedia.php` embeds `//embed.francetv.fr/…` — protocol-relative, a relic of
sites that served both schemes. The site is HTTPS-only. The scheme is made
explicit; nothing else about the embed changes.

Worth knowing rather than acting on: this is a **third-party iframe**, so
francetv sees every visitor to that page. That was already true and is not this
sub-project's to change.

### Contact details port verbatim

`commencement` carries two mobile numbers and `comite_teamdirection` carries the
committee's names, roles and a number. These are the band's own published
contact details, already public on the live site, and the pages exist to
publish them. They go into the repository unchanged.

(They were deliberately kept out of the design mockup published at
https://claude.ai/code/artifact/ec2ff76f-b64a-4fd0-a5ed-89c5ab2c5a3b — an
artifact goes to an external service; the repository does not.)

### The content contradicts itself, and the port reproduces it

`historique` says Delphine Maillard and Laura Mantel *"passent à présent le
flambeau à deux jeunes musiciennes, Lilou Keller et Anaïs Meuwly"*.
`comite_teamdirection` still lists Laura Mantel as **Responsable Team
Direction** and the **Direction musicale** as *"Laura Mantel et Delphine
Maillard"*.

Both are reproduced exactly as they read today. A port is a port: deciding which
version is current is a content question for the band, not a technical one to
settle inside a refactor. **It is recorded in `docs/continue-here.md` as an open
content question** so it is not lost — that is the whole of the handling.

## How they are built

Everything comes from the A1 system. No page introduces a colour, a font size or
a spacing value of its own.

- **Page shell** — `<section className="mx-auto max-w-3xl px-4 py-8">`, widening
  to `max-w-5xl` for the two grid pages.
- **Titles** — `font-display` at `text-4xl`, subtitles `text-ink-muted`.
- **Prose** — `max-w-prose` for running text, so `historique`'s five paragraphs
  stay near 65 characters rather than spanning the full width.
- **Panels** — `rounded-lg border border-line bg-panel p-5` wherever content
  groups: a committee card, an information block, a link list.
- **Photographs** — `rounded-lg` with `loading="lazy"` on everything below the
  fold, which on `canetons` is six of seven.
- **Links in prose** — `text-violet hover:underline`. External ones keep
  `target="_blank" rel="noreferrer"` and the `ExternalLink` icon the nav already
  uses.

### Alt text is rewritten, deliberately

The old markup has `alt="canetons"`, `alt="batteurs"`, `alt="Image"` — the
filename, or nothing. Each becomes a real description: *"Les Canetons en
costume, de nuit"*, *"Les batteurs des Canetons"*. This is the one place the
port does not reproduce the original, because reproducing it would mean shipping
an accessibility defect on purpose — the same reasoning that turned the old
planning page's click-handling `<span>`s into buttons.

## Testing

Nine static pages do not each need a suite. What is worth pinning:

- **Every route renders its heading** — `web/src/routes.test.tsx` already has
  exactly this shape, a `test.each` table of `[route, heading]`. This is what
  catches a route wired to the wrong component.

  **That file must change, and it is the one file that must.** Four of its
  existing rows assert on the *placeholder* headings these pages are replacing:

  ```
  ["/", "Accueil"],
  ["/historique", "Historique"],
  ["/canetons", "Les canetons"],
  ["/comite_teamdirection", "Contact Canetons"],
  ```

  Those headings come from `Placeholder.tsx` rendering its `title` prop. Once
  the real pages land the headings become the pages' own — "Bienvenue sur notre
  site", "L'Histoire des Canetons", "Nos Canetons", "Le comité" — so each row is
  updated to the real heading and the remaining five routes are added. The table
  already carries a comment marking `/planning_repet` as "the real page, not a
  placeholder — hence the fuller heading"; after A2 that distinction covers
  almost the whole table and the comment goes.

  This is a genuine difference from A1, whose acceptance criterion was that *no*
  test changed. Here exactly one test file changes, for a stated reason, and any
  other test needing an edit still means something went wrong.
- **`canetons` renders seven register sections**, because it is the one page
  where a copy-paste slip loses a whole section silently.
- **The flyer download link** on `commencement` points at the right asset and
  carries `download`.
- **No page still renders `Placeholder`** for these nine — asserted by the route
  table test above.

**Not tested:** paragraph text, which is copy that will change; and the iframe,
which is a third-party embed no test can meaningfully assert about.

## Verification

The same as A1, because the same thing is at stake: a design change is only
checkable by looking at it.

Screenshot all nine routes and read them. `npm run check`, `npm run test:e2e`,
`npm run build`, `npm run smoke`, and the Laravel suite. Then a pass against the
real API — these pages make no API calls, so what that proves is that the
**chrome and the nav still work on them**, including the active-item highlight
now that nine more routes are real.

## Risks

- **`canetons` is seven near-identical blocks.** The failure mode is a
  copy-paste slip — a wrong photograph, a caption on the wrong register, a
  duplicated section. The register names and rosters are in the old file; copy
  them across mechanically and count the sections afterwards.
- **The nav's active-item highlight is currently untested for these routes**
  because they were all placeholders. Once they are real, `ACTIVE_ALIASES` and
  the `active` expression apply to them; the route-table test covers rendering,
  not highlighting.
- **`directionmusicale.jpg` and `parrainmarraine.jpg` appear only on
  `comite_teamdirection`.** They were the two largest files before A1 resized
  them and have never been rendered by the SPA. If either looks wrong, that is
  A1's compression showing, not this port.
- **Nothing here has an API dependency**, which makes this the lowest-risk
  sub-project of the four — and the one where the temptation to skip the visual
  check is highest.
