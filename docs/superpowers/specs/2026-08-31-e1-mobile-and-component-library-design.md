# E1 — the phone pass and the component library — design

**Date:** 2026-08-31
**Branch:** `feat/e1-mobile-and-component-library`
**Status:** approved, ready for a plan

This is sub-project **E1**. Sub-project **E** was scoped as one "restyle polish +
mobile" pass; brainstorming split it in two, because it turned out to hold two
different kinds of work:

| | |
| --- | --- |
| **E1** — this spec | the phone pass: defects with clear right answers, the members' area, and the shared chrome |
| **E2** — not yet designed | the photo-less public pages: what `PhotoPending` should be, `/canetons`, `/accueil`, new copy, motion |

E1 ships first because its value does not depend on any open design question.

## What E may change

E was widened during brainstorming, twice, on request:

- **Layout, markup and interaction are in scope**, not only CSS. The A1 visual
  foundation held itself to "no markup, copy or behaviour changes"; E does not.
  Tests change where behaviour deliberately changes.
- **French copy is in scope.** The instruction was "write freely, I'll correct
  it".

**One carve-out is held anyway: E writes no names, no telephone numbers and no
dates.** Those are precisely the 17 `<Tbd>` fields, and the reason they exist is
that nobody could vouch for them. A plausible-looking wrong number dials a
stranger, which is the exact failure the content audit was avoiding. Everything
else is drafted and corrected on review.

## Why this exists: what the site actually does on a phone

Nothing here is inferred from the code. The site was built and screenshotted at
1280 and 390 across anonymous, member and admin, and these are the findings.

### A defect, phone only

On `/planning_repet` as an admin, `EventActions` is positioned
`absolute top-2 right-2`. At 390px the `Modifier` and `Supprimer` buttons sit
**on top of the event date**: the first card reads `dimanche 20 se[Modifier]2(`
and the third `samedi 14 nover[Modifier]u 15 novembre 2026`. The date — the one
thing the card exists to tell you — is unreadable.

Desktop at 1280 is fine, which is why nothing caught it. Neither the unit suite
nor the e2e suite can see it: both assert on roles and text, and the text is all
present in the DOM. It is only wrong on screen.

### The members' area, which is the only repeat-use surface

The nine public pages are read once by a stranger. `/planning_repet`,
`/sinscrire`, `/inscriptions_utilisateurs` and `/inscriptions_admin` are read
every week, on a phone, outdoors, by someone checking whether they play on
Saturday. That asymmetry is why *Scène* has a light page body at all, and it is
what E1 optimises for.

- **`/sinscrire`** — the "do I play Saturday?" screen — is a three-column table
  squeezed into 390px. Every cell wraps to three lines, and the `S'inscrire`
  button is about 28px tall.
- **Answering an event takes four interactions**: tap `S'inscrire`, land on a
  new page, open a `<select>` (an OS wheel picker on a phone), pick, tap
  `Confirmer`. For a yes/no question.
- **An answer cannot be changed.** Once `event.response` exists, `/sinscrire`
  renders a *disabled* `Choix enregistré` button. This is a UI restriction the
  API does not impose: `ResponseController::store` upserts on
  `(user_id, event_id)` — its own comment says "Answering again overwrites". So
  a mistap is permanent for the member and trivially fixable for the backend.
- **`/inscriptions_utilisateurs`** additionally renders a read-only text input
  holding your own username, which the header already shows.
- **`/inscriptions_admin`** stacks four stat tiles full-width: 470px of an 844px
  phone for four numbers. The responses table's `Participation` header is
  clipped to `Participatio` by the horizontal scroll container.

### The chrome

- **The phone nav** is an unlabelled hamburger revealing ten text links at about
  24px each, with no visual boundary against the page content it pushes down.
  Every target is roughly half the 44px minimum.
- **The header costs 156px** of an 844px phone (100px header + 56px nav) before
  any content, with the band name wrapping to two lines.
- **Gutters do not line up.** The chrome is `max-w-5xl`; most pages are
  `max-w-3xl`. At 1280 the nav's first item starts at x=143 and the page content
  at x=272. Pages use five different widths: `max-w-3xl` (16 sites), `max-w-5xl`
  (8), `max-w-md` (4), `max-w-4xl` (4), `max-w-2xl` (3).
- **The desktop nav wraps to two rows at 1280**, leaving the auth item alone on
  the second row.

### The duplication that makes all of this expensive to fix

| Pattern | Occurrences |
| --- | --- |
| `rounded-lg border border-line bg-panel p-5` — the panel card | **28** |
| `bg-violet px-…` — the primary button | 8 |
| `hover:border-violet` — the secondary button | 8 |

A touch-target rule applied by hand across 28 card sites and 16 button sites is
a rule that survives exactly until the next page is written.

## The rule that makes E1 checkable

**The suite contains zero class-name assertions.** The single `toHaveClass` that
the A1 spec called out has already been replaced by an `aria-current` assertion.
All 125 unit tests and all five e2e specs assert on roles, accessible names and
French text. The single exception is an id selector in `planning.spec.ts`, which
is called out under "Tests that change by design" and stays untouched.

So E1 gets a hard acceptance criterion:

> **Every test passes untouched, except the ones listed under "Tests that change
> by design". If any other test needs changing, the refactor overreached.**

This is the same criterion A1 used, and it is what makes a sixteen-page refactor
reviewable at all.

## 1. Tokens

Added to the `@theme` block in `web/src/styles.css`:

| Token | Value | Purpose |
| --- | --- | --- |
| `--spacing-touch` | `2.75rem` (44px) | the floor for every interactive control |
| `--container-shell` | `72rem` | chrome **and** page shells |
| `--container-text` | `44rem` | prose columns inside a shell |

**Verify before relying on it:** Tailwind 4 must actually generate `min-h-touch`
from `--spacing-touch`. The `--spacing-*` namespace feeds the spacing utilities,
but confirm the generated class exists rather than assuming it — a missing
Tailwind class fails silently as an unstyled element, exactly as the A1 spec
warned about the `canetons-red` rename.

One `@utility` provides a visible `focus-visible` ring from a single place.

## 2. Container discipline

One shell width for the chrome and for page shells, with prose constrained
*inside* it by `max-w-text`. This retires the five competing widths and is what
makes the nav and the content share a left edge.

`PageSection` owns this, with three widths: `shell`, `text`, `form`.

## 3. shadcn/ui via the CLI

### What is vendored

`button`, `card`, `table`, `input`, `sonner`, `alert-dialog` — six components,
chosen because each replaces something that exists today or fixes something that
is wrong today. Nothing is added speculatively.

New devDependencies: `@radix-ui/react-slot`, `@radix-ui/react-alert-dialog`,
`sonner`, `class-variance-authority`, `clsx`, `tailwind-merge`. They go in
`devDependencies` like `react` itself does — the build bundles everything, so
this project has no runtime dependencies by design.

**Deliberately not installed:**

- **`next-themes`** — see the traps below.
- **`@radix-ui/react-label`**, and shadcn's `label` component with it.
  `FormField` already owns the `aria-invalid` / `aria-describedby` / error-`id`
  wiring, and its own comment explains why that lives in one place: a
  `describedby` pointing at a non-existent id announces nothing and nothing
  complains. It keeps its native `<label htmlFor>` and merely renders shadcn's
  `Input` inside.

**Deliberately not vendored:** `select` (the app's only `<select>` is being
deleted by this very spec), `sheet` (the nav disclosure stays), `calendar` and
`date-picker` (native `<input type="date">` and `type="time"` give a phone its
own excellent pickers — replacing them would be a regression on the surface E1
exists to improve), `dialog` and `dropdown-menu` (nothing needs them).

### The token mapping is one-directional

shadcn's semantic names become **aliases of the Scène tokens**. They never
introduce a colour of their own, so the palette has one source of truth and
cannot drift:

| shadcn | Scène |
| --- | --- |
| `--background` / `--foreground` | `--color-ground` / `--color-ink` |
| `--card`, `--popover` (and `-foreground`) | `--color-panel` / `--color-ink` |
| `--primary` / `--primary-foreground` | `--color-violet` / `#fff` |
| `--secondary` / `--secondary-foreground` | `--color-panel` / `--color-ink` |
| `--muted` / `--muted-foreground` | `--color-ground` / `--color-ink-muted` |
| `--accent` / `--accent-foreground` | `color-mix(in oklab, var(--color-violet) 10%, white)` / `--color-violet` |
| `--border`, `--input` | `--color-line` |
| `--ring` | `--color-violet` |
| `--destructive` | `--color-danger` |
| `--radius` | `0.5rem`, which reproduces today's `rounded-lg` |

**`--color-pink` is absent from shadcn's vocabulary on purpose.** shadcn spends
`--accent` on hover *surfaces*, and the palette's rule is "emphasis only — never
a whole surface". So `--accent` gets a 10% violet tint and pink stays hand-applied
where it is today: the band name in the header.

This mapping is the single point where a component library could quietly
neutralise a palette the project documents as the band's identity. It is written
here so the plan treats it as load-bearing rather than boilerplate.

### Three traps, verified rather than assumed

1. **`shadcn init` writes a `.dark` block. Delete it.** Scène commits to one
   look — A1 rejected dark mode explicitly, as "two would double the surface for
   nobody who has asked". Leaving the block means a stray `dark` class renders a
   design nobody approved, and nothing in the suite would notice.

2. **`sonner` must be hand-edited on arrival.** Its registry item at
   `https://ui.shadcn.com/r/styles/new-york/sonner.json` declares
   `["sonner", "next-themes"]` as dependencies and its source imports
   `useTheme` from `next-themes`. That is a Next.js package in a Vite project,
   and this site has one theme. Strip the import and the hook, hard-code the
   theme, and do not install it.

3. **The `@/*` alias goes in three files.** `tsconfig.json` (`paths`, with
   `baseUrl`), `vite.config.ts` (`resolve.alias`) **and `vitest.config.ts`,
   which is a separate config file in this repo.** Miss the third and every test
   importing a vendored component fails to resolve while `npm run build` stays
   green — a green build over a red suite. Note `vite.config.ts` sets
   `root: "web"`, so the alias target is `web/src` relative to the repo root in
   all three.

Also: `"use client"` directives in vendored output are stripped, being
meaningless outside Next. And `npm run fix` runs after each `shadcn add`, because
vendored output is not Prettier-clean against this repo's config and CI's
`format:check` would fail on it. Vendored components are **not** added to
ESLint's ignore list — unlike `web/src/api/generated/`, this is source we edit,
so it is linted like everything else.

### Project-owned components, on top

Vendored code stays in `web/src/components/ui/`; ours stays in
`web/src/components/`.

| Component | Replaces | Carries |
| --- | --- | --- |
| `PageSection` | ~35 hand-written `mx-auto max-w-… px-4 py-8` wrappers | the three widths |
| `StatTile` | the four `/inscriptions_admin` tiles | 2-up on phone, 4-up from `sm` |
| `EventCard` | `/planning_repet`'s card tree, and `/sinscrire`'s table, which would otherwise become a second near-identical one | the date heading and title, with `children` for meta and `actions` for the footer |

`Card` (vendored) is used bare for a simple panel, and with
`CardHeader`/`CardContent`/`CardFooter` only where there is genuine structure —
`EventCard`, `SouperCta`, the `/commencement` fact cards. Wrapping a two-line
panel in four subcomponents is heavier markup for no gain.

`PhotoPending` and `Tbd` are untouched by E1. Their shape is E2's first decision.

## 4. Chrome — `Layout.tsx`

- **Header**: logo to 48px on phone, band name on one line, so the header costs
  less of an 844px screen. The `<p>`-not-`<h1>` decision stands and its comment
  stays.
- **Phone nav**: the hamburger gains a visible "Menu" label and a 44px target.
  The open panel goes full-bleed on `--color-stage` with 48px rows and dividers,
  so it reads as a menu rather than as page content. **The `aria-expanded` /
  `aria-controls` wiring is untouched**, as is `aria-current="page"` and the
  `ACTIVE_ALIASES` behaviour that highlights "Inscriptions" for the two
  sub-pages.
- **Desktop nav** widens to `max-w-shell` so all ten entries — eight links, Galerie and the auth item — fit one row at 1280,
  with the auth item pushed right by `ml-auto`.
- **The nav link set and its order are not touched.** They were copied from the
  deleted `navigation.php` because they are the order the band is used to.
- **Footer** unchanged in behaviour, moved to `max-w-shell`.
- **`EnvRibbon`** unchanged. Its "unknown env means PROD, i.e. no ribbon"
  default remains load-bearing.

## 5. Page changes

### `/sinscrire` — answer inline, one tap

Cards at every width, via `EventCard`. One markup tree, therefore one set of
tests. These rows were never really tabular: the third column is a pair of
action buttons. The two `/inscriptions_admin` tables stay tables, because those
genuinely are data.

- **Unanswered**: two buttons, `Je participe` and `Je ne participe pas`, each at
  least 44px, full-width on phone and side-by-side from `sm`.
- **One tap commits.** `useResponseStore` already exists and already upserts;
  success invalidates `getEventIndexQueryKey()` so `event.response` refreshes.
  A `sonner` toast confirms the save.
- **Answered**: the answer is shown as state, with a `Modifier` secondary button
  that reveals the two buttons again. This is what makes one-tap safe — the
  mistap it risks is self-correcting, and the API has always allowed the change.
- Errors go through the existing `translateApiError` path and render in the card.
- An admin still gets `Résumé`. The capability matrix is unchanged and is still
  not a hierarchy: `respond` belongs to user and moderator, `view_summary` to
  admin, and they do not overlap.

### `/inscriptions_utilisateurs` — the same two buttons

The URL stays, because URLs are frozen and because `/sinscrire` links to it
today; it becomes the deep-link entry point for one event. The `<select>`, the
`Confirmer` step and the read-only username input all go.

### `/planning_repet` — the overlap fix is structural

The admin actions come **out of `absolute top-2 right-2`** and into a normal
footer row inside the card. That is the fix; no amount of spacing tuning makes an
absolutely-positioned overlay safe at an unknown text width.

The card body compresses from five label-value lines to three:

```
dimanche 20 septembre 2026        <- the heading, unchanged
Concert d'automne                 <- prominent; the "Titre :" prefix goes
19:00 – 22:00 · Salle communale   <- the two time lines and the place, merged
Tenue : Costume des canetons      <- keeps its label
```

`Titre :` goes because the line is obviously the title. `Tenue :` keeps its
label because it is the detail members scan for and the one they get wrong. The
existing behaviour of omitting the `Tenue` line entirely when there is no dress
code is preserved — a rehearsal with no tenue is legitimate, and an empty label
reads like missing data.

### `/inscriptions_admin`

Tiles 2-up on phone via `StatTile`, 4-up from `sm`. The tables keep their
`overflow-x-auto` and gain a `min-w` so the `Participation` header stops
clipping, plus `scope="col"` on the headers. The `aria-live="polite"` on the
tile list stays: the numbers change when the query refetches and an admin
watching the page should hear it. The deliberately different wording between the
tiles and the table cells stays too — it exists so an accessible-name query
cannot match a tile and five cells at once.

### `EventActions` — a real dialog and a real toast

`window.confirm("Êtes-vous sûr de vouloir supprimer cet événement?")` becomes an
`alert-dialog`, and `window.alert("La suppression … a échoué")` becomes a
`sonner` toast.

**The in-flight guard must survive.** The current code returns early if
`destroy.isPending`, and its comment explains why: without it a second click
re-prompts while the first delete is still in flight. A dialog changes the
mechanics of that guard, not its necessity, and there is a test pinning it.

The real-`<button>`-not-`<span>` decision and the event title in each
`aria-label` both stay — a list of three buttons all announced as "Supprimer" is
unusable without sight of the row.

### Everything else — mechanical

`/signup`, `/signups_admin`, `/contact`, `/authentification_inscription`,
`/confirmation`, `/signup_thanks` and the nine public pages are routed through
`PageSection`, `Card`, `Button` and `Input`, and held to the touch-target floor.
No behaviour changes, no copy changes. `/signup` is already the best-composed
page on the site and gets the floor and nothing else.

Their *shape* is E2.

## 6. Tests that change by design

Everything not on this list must pass untouched.

| File | What changes |
| --- | --- |
| `web/src/pages/Sinscrire.test.tsx` (~34, 57–58) | the disabled `Choix enregistré` button no longer exists; answering happens on this page and can be changed |
| `web/src/pages/InscriptionsUtilisateurs.test.tsx` | the `Participation :` select becomes two buttons |
| `web/src/pages/PlanningRepet.test.tsx` | the compressed card: no `Titre :`, one merged time line |
| `web/src/pages/EventForm.test.tsx` (109, 124, 142, 146, 158) | four `window.confirm` stubs and their call-count assertions become dialog interactions. **Line 124's behaviour — no second prompt over an in-flight delete — must be preserved, not dropped with the stub.** |
| `web/e2e/members.spec.ts` (30, 34) | `selectOption("participate")` becomes a tap; `Choix enregistré` becomes the saved state plus `Modifier` |

New tests: `EventCard`'s heading level; `Button`'s `aria-disabled`-never-
`disabled` invariant; changing an existing answer end-to-end; the phone nav's
row height at 390px.

`web/e2e/planning.spec.ts` samples animation frames around the submit button and
selects `#event-title` by id. It must keep passing untouched — that id and that
form are not in scope.

## 7. Commit order

Each commit is independently green, and each stage is screenshotted at 1280 and
390 before the next begins.

1. `@/*` alias in all three configs, plus the stale `vitest.config.ts` comment
   corrected — it still explains itself in terms of the old front end and says
   it becomes redundant "once the SPA cutover lands", which has happened.
   Merging the two configs is sub-project B's business, not E1's.
2. `shadcn init` and the token mapping; delete the `.dark` block; `sonner`
   de-`next-themes`'d.
3. The vendored six, with `npm run fix` after each.
4. Tokens, `@utility` focus ring, `PageSection`, `StatTile`, `EventCard`, with
   their tests.
5. `Layout.tsx` — chrome and the phone nav.
6. The mechanical page swaps, no behaviour change. The suite must be untouched
   at the end of this commit; that is the checkpoint proving the refactor did
   not overreach.
7. `/planning_repet` and `EventActions` — the overlap fix, the compressed card,
   the dialog and the toast.
8. `/sinscrire` and `/inscriptions_utilisateurs` — the inline answer.
9. `/inscriptions_admin` — tiles and tables.

## 8. Risks

- **This is a sixteen-page refactor on top of a restyle.** That is the shape the
  chosen approach implies, and the commit order above is the mitigation: step 6
  ends with a green untouched suite, which is the moment the refactor is proved
  safe before any behaviour changes.
- **The token mapping is the one place a library can neutralise the palette.**
  It is one-directional for exactly that reason. Anyone editing it should open
  `docs/superpowers/specs/2026-08-29-visual-foundation-design.md` first.
- **A missing Tailwind class fails silently.** `min-h-touch` and `max-w-shell`
  must be confirmed to exist as generated utilities, not assumed. `grep` for the
  28-occurrence card literal after the swap; a leftover is invisible in a green
  suite.
- **One-tap commit has no confirmation step.** Mitigated by the answer staying
  changeable — which the API has always supported and only the UI forbade.
- **The suite cannot see layout.** Every finding in this spec came from looking
  at rendered pages, and two of them (the button overlap, the clipped table
  header) are invisible to a fully green suite. Screenshot review is part of the
  work, not a nicety.
- **Nothing here is verifiable on the host by CI.** E1 touches no `.htaccess`
  and no API, so the FastCGI class of trap does not apply — but the deploy is
  still TEST-first, and TEST is where this gets looked at on a real phone.

## 9. Non-goals

**E2 inherits, so it is recorded here rather than lost:**

- `PhotoPending`'s shape. It is a 160px-minimum dashed box, and `/canetons` is
  eight of them stacked — 3062px tall on a phone, where six of the seven
  registers say only "à compléter". "Much smaller" is the obvious hypothesis and
  it is E2's first decision.
- `/canetons`'s structure, and `/accueil`, which is a heading and one dashed box
  and is the front door.
- New copy on the public pages.
- Motion, of which there is currently none.
- The French inconsistencies ported on purpose — `Nom:` versus `Nom :`, the
  title-cased "Liens Amis". If they are worth settling, they are settled as an
  explicit decision with the band, not silently.

**Out for both:**

- Dark mode. A1 rejected it and this spec deletes the `.dark` block that
  `shadcn init` writes.
- Print styles. One existed briefly for a recruitment flyer and was removed on
  request; nothing depends on it.
- Routes, URLs, the API, the database and the capability matrix.
- Bringing back `/cd`, `/multimedia` or `/sponsors`. All three are commented out
  with their nav entries, and `routes.test.tsx` asserts they fall through to the
  404 view.
- Filling in any `<Tbd>`. PROD stays blocked on those, and that is a content
  gate, not a code one.
