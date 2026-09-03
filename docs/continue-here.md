# Where we left off — 2026-09-03

Read this first when picking the SPA cutover back up. It records what is **not**
derivable from the repository: the state of three servers, decisions taken in
conversation, and the handful of traps that cost time and would cost it again.

Everything else is in the tree and should be read there rather than duplicated
here:

| For | Read |
| --- | --- |
| Architecture, host constraints, commands | `CLAUDE.md` |
| Why the SPA is shaped the way it is | `docs/superpowers/specs/2026-07-27-frontend-spa-cutover-design.md` |
| What changed since (hard cutover, mocks) | `docs/superpowers/specs/2026-08-28-spa-clean-cutover-and-mocks-design.md` |
| The work itself, step by step | every plan in `docs/superpowers/plans/` dated 2026-08-28 or 2026-08-29 — **all of them are done** |
| The design decisions behind them | every spec in `docs/superpowers/specs/` dated 2026-08-29 |
| **What happens next, and why the obvious clean-ups were rejected** | `docs/superpowers/specs/2026-08-31-post-cutover-ship-and-cleanup-design.md` |
| How the cutover was shipped, step by step | `docs/superpowers/plans/2026-08-31-ship-the-cutover.md` |

## START HERE: what to do next

**E2 is designed as three rounds. E2a and E2b are shipped; E2c is next, and its
spec is already written** — so the next session plans and executes, it does not
brainstorm. The remaining blocker on PROD is unchanged and is not code: the
`<Tbd>` and `<PhotoPending>` placeholders.

### Nothing is in flight — `main` is the whole truth

`main` is at **`4f17eb3`**, CI is green on it, and **CI auto-deployed it to TEST,
where E2b was verified in a real browser on 2026-09-03** (see the verification
list below). There is no open PR you need to know about at the time of writing —
but check, because that sentence is the one that rots: `gh pr list` and
`gh run list --branch main --limit 1`.

> **E2b took two merges, and the second one is the lesson.** `748241a` (PR #70)
> merged with a red `e2e` job on Linux, so `deploy-test` — which lists `e2e` in
> `needs` — was **skipped**, and TEST sat on E2a while `main` claimed E2b. CI
> working exactly as designed. `4f17eb3` (PR #71) reverted the offending piece
> and the deploy went through. **A merge is not a deploy: check
> `gh run list --branch main --limit 1` after every one.**

The cutover
shipped on 2026-08-31 (rollback tag `2026-08-31-f120b9f`), the old PHP front end
is gone, and sub-projects **A**, **C**, **D**, **E1**, **E2a** and **E2b** are all
done.

> **This file described PR #70 as open right up to the moment it was merged, and
> that was deliberate** — the section named the PR, said it was unmerged, and told
> the reader to run `gh pr view 70` rather than believe it. It was rewritten to
> this the moment the merge landed. Do the same: describe state, or say which
> commit the statement is true at. The trap is real — an earlier version warned
> that PR #61 was open, and the commit saying so was swept into the very squash
> that merged it, leaving `main` contradicting itself.

What `c7b95fe` (PR #63) did — three plans, 45 commits, squashed:

- **E1a** — `GET /api/events` returns **upcoming events by default**;
  `?include=past` returns the whole history. The endpoint used to return every
  event ever, ascending, so the next rehearsal sat at the *bottom* of a growing
  list. Plus the shadcn/ui foundation, mapped one-directionally onto the *Scène*
  palette, and `PageSection` / `StatTile` / `EventCard`.
- **E1b** — the phone pass. The header costs 117px of an 844px phone instead of
  156; the phone nav is a labelled trigger over ten 48px rows on the dark stage
  surface; every interactive control clears 44px; `/sinscrire` became cards that
  answer in **one tap**; `window.confirm`/`window.alert` became a real dialog and
  a toast; the admin tiles grid 2-up. **And the defect E1 existed for:**
  `/planning_repet`'s Modifier/Supprimer were `absolute top-2 right-2` and at
  390px rendered *on top of the event date*.
- **E1c** — `/sinscrire` merged into `/planning_repet`. One public page, nav entry
  **"Événements"**, every control on the card gated by the capability that
  already gated it. `/sinscrire` redirects. `RequireAuth` deleted.

Verified against TEST after the deploy: `GET /api/config` answers `env=test`,
`/planning_repet` and `/sinscrire` both 200, and the deployed JS bundle contains
every new string (`Connectez-vous`, `Voir les événements passés`, `Résumé`) and
**none** of the three retired ones (`Planning des prestations`,
`Choix enregistré`, `Événements à venir`).

> **TEST's database has three events and all three are in the future**
> (2026-09-20, 10-10, 11-14). So the upcoming-by-default filter returns all of
> them there and the past-events archive is **empty on TEST** — neither feature
> can be seen to discriminate until an event passes. That is data, not a defect.
> Do not read "the archive is empty" as "the archive is broken".

### The sub-projects

| | | |
| --- | --- | --- |
| **B** | Structure clean-up (English filenames, dead files, the two deferred review items) | **not started** |
| **C** | Content audit | **done** — `docs/content-audit-2026-08-31.md` |
| **D** | Content corrections | **done** — PRs #60 and #61, both merged |
| **E1** | Phone pass, component library, events filter, one events page | **done** — PR #63 |
| **E2a** | `/canetons` register index, one-line `PhotoPending`, the image guard | **done** — PR #65 |
| **E2b** | `/accueil` as a front door | **done** — PR #70, squashed to `748241a` |
| **E2c** | Feedback motion and one spacing scale | **next** — designed; was last on purpose |

### E2 is three rounds, and the order is load-bearing

The specs are all dated 2026-09-01 in `docs/superpowers/specs/`. Build in order:

- **E2a** — shipped as `022f8b9`. See below.
- **E2b** — shipped as `748241a` (PR #70). `/accueil` *looked* blocked on copy nobody had
  written; it was not. `/historique` already publishes the founding date, the
  7-18 age range, "pas besoin de connaître la musique" and the Saturday
  rehearsals, and the hero condenses those. **The head-count is deliberately
  dropped:** the source says the band *grew to* forty in 2003, and asserting
  that today would be a new and perishable claim. See "What E2b shipped" below.
- **E2c** — motion and one spacing scale (ten distinct `mt-*` values across 94
  uses become four named steps). **Last, because a scale applied to pages E2b is
  about to reshape is work done twice.** Motion only where it reports that
  something happened, all behind `prefers-reduced-motion`. Entrance and
  scroll animation were rejected: this site is read on phones, outdoors.

The **French inconsistencies are not in E2**. They were ported deliberately and
get settled with the band, not silently.

### What E2b shipped, and the three numbers it measured

`748241a` (PR #70) turned `/accueil` from "the souper card, the words *Bienvenue sur notre
site*, and one placeholder box" into a hero, a next-event block and four curated
destination cards. With the souper flag **off** — the state the page exists for —
it went from 1103px of nothing much to a real front door.

Three measurements are worth keeping, because they were all guessed wrong first:

1. **The souper card is 458px of an 844px phone screen** on its own. That is why
   the hero cannot be above the fold while the flag is on, and it is not a defect
   in the hero: the spec puts the time-sensitive card first on purpose. An e2e
   test asserting the hero was on the first screen contradicted the page's own
   approved order; it measures the hero's own **footprint** instead (badge width
   ≤ 200px, badge-top to sentence-bottom ≤ 460px).
2. **The `<h1>` wraps to four lines at 390px at `text-3xl` AND at `text-4xl`.**
   A comment claiming `text-4xl` cost four lines was simply false; the real
   saving is 16px of line-height. Measured with `Range.getClientRects()`.
3. **A two-column mutation does not make the page scroll sideways** — grid tracks
   shrink and text wraps. The overflow guard trips only on content that cannot
   shrink (a `whitespace-nowrap` string takes `scrollWidth` to 502 against 390).
   Worth knowing before trusting any such test elsewhere.

> **The defect that a green suite could not see, again.** The four destination
> cards shipped with no visible heading, so at both widths they read as a
> continuation of "Prochain événement" — one heading over five identical cards —
> while a screen reader heard a properly named second list. The two trees
> disagreed. Found by screenshotting `/` in three roles at two widths with the
> flag both on and off. `DestinationCards` renders its `label` as a visible `h2`
> now, `aria-labelledby` wired, on `NextEvent`'s own `mt-8`/`h2`/`mt-3` rhythm.

`NextEvent` **renders nothing** when it has nothing — pending, error and an empty
list all collapse into one guard, so a slow or failing `/api/events` cannot touch
the hero. There is deliberately no "aucun événement" empty state: on a band's
front page that reads as "this band does nothing".

**`DestinationCards` must never be generated from `NAV`.** The nav is the source
of truth for what *exists*; this is a curated shortlist of what a stranger wants
first. Both the component and the page say so in comments, and a test pins the
four routes and their order.

### The pre-merge UX round, and the three things it changed

Reviewing PR #70 before merge raised three points, all shipped in it:

1. **The souper announcement is a BANNER, not half the first screen.** It was a
   458px centred card above the hero — 54% of an 844px phone — so the badge sat
   at y=639 and the `h1` at y=804, both below the fold. **The souper is
   temporary** (flag-gated, one event in November 2027), so the front page has
   to read well in both states, and it did not in the "on" state. It is now
   title + date + one line beside the button, left-aligned: **226px on a phone,
   118px on desktop**, badge at y=407, `h1` at y=572. `occasion.subtitle` and
   `occasion.teaser` are deliberately gone from it — **`Signup.tsx` already
   renders both**, so the detail is one click away on the page where you act on
   it. `web/e2e/accueil.spec.ts` pins the banner's height AND that the badge and
   `h1` stay on the first screen with the flag on — the assertion the earlier
   "hero above the fold" attempt could not make.
2. **Nothing reset the scroll position on navigation, anywhere on the site.**
   React Router resets nothing by default, so every `<Link>` kept the previous
   offset: `/` scrolled to the bottom, click a destination card, arrive on
   `/canetons` at **scrollY 1120**. `web/src/components/ScrollToTop.tsx` fixes it
   site-wide.
3. **`/admin` was an orphan and is now a redirect.** Nothing linked to it, and
   its one card duplicated the nav's "Événements" entry, so the page is deleted
   and the URL redirects to `/planning_repet` — the same treatment E1c gave
   `/sinscrire`, and for the same reason: URLs are frozen here. It is
   deliberately **no longer capability-guarded**, because `/planning_repet` is
   public and gates its own admin controls, so an anonymous visitor lands on the
   planning rather than being bounced to login for a page that no longer exists.

> **A FRESH `/canetons#trombones` STILL DOES NOT JUMP, and the attempt to fix it
> is the most useful thing in this section.** The gap is real and predates E2b:
> scrollY stays 0 with the section at y=1371, because the browser tries the
> fragment while the document is first parsed, before the SPA has rendered the
> section it names. Closing it looks like a two-line job. It is not.
>
> Calling `scrollIntoView` from the effect under-scrolls to y=323, because the
> self-hosted Bungee/Karla faces swap in shortly after first paint and reflow
> every heading — the document grows from **1872px to 2134px** — and
> `scrollIntoView` clamps to whatever height exists when it runs. Awaiting
> `document.fonts.ready` first measured **y=81 on Windows**, an exact match for
> an in-page chip click, and shipped. **It then measured y=291 in CI on headless
> Linux, went red on `main`, and blocked the TEST deploy.** Two
> `requestAnimationFrame`s had also been tried and were not enough — the swap
> took three frames, not a fixed count.
>
> **`document.fonts.ready` is a font-loading signal, not a "layout has settled"
> signal**, and one scroll fired at a guessed moment is platform-dependent by
> construction. It was reverted rather than have its bound loosened: a bound
> relaxed to accept y=291 would pin nothing, and a register sitting 291px down
> reads as broken anyway. Doing it properly means observing the element's
> document offset until it stops moving — a `ResizeObserver`, or a bounded rAF
> loop that re-asserts while the geometry changes and bails on real user input —
> and **verifying it on Linux**, not on one developer's machine. `ScrollToTop`'s
> own doc comment carries this so nobody re-attempts the cheap version.

### Verified on TEST in a real browser — 2026-09-03, at `4f17eb3`

Fourteen checks against the deployed TEST server, at 390x844, with Basic Auth
supplied from `.env.test`'s `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` (Playwright's
`httpCredentials` — no manual login needed):

`GET /api/config` 200 and `env=test` · no `cgi-bin` 301 on `/api/*` (the FastCGI
trap that once took TEST down) · the hero heading is E2b's · the hero sentence
renders · the destinations carry a visible heading · four destination cards ·
"Bienvenue sur notre site" is gone · the souper banner is **198px** · a
destination card lands at **scrollY 0** (from 589) · `/admin` redirects to
`/planning_repet` · no sideways scroll · the PWA manifest still carries
`crossorigin="use-credentials"`. The next-event block shows **dimanche 20
septembre 2026 · Concert d'automne · 19:00–22:00 · Salle communale**, which is
the correct next of the three events on TEST (2026-09-20, 10-10, 11-14).

> **Two of those checks were wrong before they were right, both in the same way,
> and it is the trap this file already documents.** A non-waiting
> `isVisible()` reported the next-event block ABSENT — it was still in flight;
> with a `waitFor` it renders. And a geometry read taken a beat early reported
> the badge at **h=0** and the `h1` at 72px rather than 144px, because neither
> the JPEG nor Bungee had loaded. **Nothing in Playwright's non-waiting API
> waits for anything.** Both readings looked like defects and were not.
>
> **But the second one exposed a real defect.** Neither logo `<img>` carried
> `width`/`height`, so the browser reserved no box: the badge's `h-auto`
> computed to 0 until the bytes arrived and the whole hero jumped **141px** when
> it landed — and `BrandLogo` was `loading="lazy"`, which on the front page's
> above-the-fold hero guarantees exactly that. Both fixed, with the intrinsic
> pixels (139x172 and 237x174) written in and two tests pinning them, because a
> browser renders identically once the image is cached: this regresses silently
> and only for a first-time visitor.

The register chips are untouched by all of this: `RegisterIndex` uses plain
`<a href="#id">`, which never enters the router, so no location change fires.
That also means **`canetons.spec.ts` cannot detect a regression in the hash
branch** — only `ScrollToTop.test.tsx` can. Proven by mutation, both ways.

`web/src/setupTests.ts` now stubs `window.scrollTo`, `Element.prototype.scrollIntoView`
and `document.fonts` — jsdom implements none of them, and without the stubs every
test that renders `Layout` logged 31 "Not implemented" lines that read like
failures. The stubs are guarded on `typeof window`, because `altcha.test.ts` opts
into the `node` environment and has no `window` at all.

### What E2a shipped, and the framing that is easy to get backwards

`022f8b9` (PR #65) did three things:

- **A register index on `/canetons`** — a row of jump-link chips, each register
  `<article>` carrying a stable English `id`.
- **`PhotoPending` is one line, not a 160px box.** `/canetons` went from 3034px
  to **2134px** at 390px. `/accueil` and `/moniteurs` inherit it.
- **`tools/image-budget.mjs`**, wired into `npm run check` as `guard:images`.

> **The placeholders did NOT make `/canetons` too long, and a session that
> assumes they did will design the wrong thing.** One photo per register is a
> requirement carried from the legacy site, the band is re-shooting them, and
> the *photographed* page measures ~3554px — longer than the placeholder page
> ever was. The length is inherent, so the page got a **way in**, not a diet.
> Photos will keep their natural aspect ratio: the legacy captions read "de
> gauche à droite", so a uniform crop can cut a person out and make the caption
> wrong.

Verified against TEST after the deploy, in a real browser at 390px: the index
renders 7 links, the 8 placeholders are single lines, the page is 2134px, and
clicking "Trombones" actually scrolls (`scrollY 1290`, URL `#trombones`). The
one console error is `401 /api/user` — the session probe for an anonymous
visitor, which is correct — and the PWA manifest still carries
`crossorigin="use-credentials"`, so that previously-fixed bug has not returned.

### The logo rework, and the one thing it could not fix

Shipped with the duck lockup (PR #69): the header carries the duck mark plus a
Bungee wordmark, the original badge moved to `/accueil`, and `Logo.tsx` holds
both with the reasoning for the split. The wordmark deliberately carries **no
accent colour** — "Canetons" used to be pink, an inch from the duck's red beak,
and matching them by turning it red only moved the clash, because the phone
nav's active row is that same pink two rows below. The rule that came out of it:
**colour in the header means the MARK, colour in the nav means STATE.**

**THE FAVICON IS STILL A SMUDGE AT 16px, and cropping will not fix it.** Two
structural causes, both measured on 2026-09-03: the duck is portrait (438x613 of
ink) fitted into a square, so it shrinks and floats; and it is thin line art, so
at 16px a 1px white stroke lands between pixels and greys out. A tighter
head-and-beak crop was built and rasterised to a real 16px — features about 40%
larger, the beak a solid block instead of a smear — and it is better but still
not good. **The honest fix is purpose-drawn small-size artwork** (a simplified
silhouette, bolder strokes, or the beak alone), which is what Apple and Google
ship and what the `<link rel="icon" sizes>` set already supports. That is a
drawing task, best done in Claude Design where the duck came from — not a coding
one, which is why it was left rather than bodged.

Whoever picks it up: `favicon.ico` also carries 16/32 and cannot be rebuilt
without adding an image dependency to a project that deliberately has none.
Either drop its `<link>` (nothing since pre-Chromium IE needs it) or accept the
`.ico` and the PNGs disagreeing at small sizes.

### What E2 inherits

E1 stopped at the point where the next decisions are about content and identity
rather than ergonomics. Explicitly left undone, and why:

- ~~**`PhotoPending`'s shape.**~~ **Settled by E2a**: one line, not a 160px box.
  It keeps its dashed border, its `what` prop and its `data-photo-pending` hook.
- ~~**`/accueil` as a front door**~~ — **done by E2b (PR #70)**: a hero condensed
  from `/historique`, a live next-event block, four curated destination cards.
  Motion and the spacing scale are E2c, still open.
- **The ported French inconsistencies** — `Nom:` versus `Nom :`, "Liens Amis".
- **A server-side 301 for `/sinscrire`.** The redirect is client-side only. A
  `RedirectMatch 301` in `config/htaccess/site.htaccess` would be cheaper and
  more correct, and that file already carries exactly this kind of legacy-URL
  rule — but it is server-owned, never uploaded by a deploy, and `CLAUDE.md`
  documents three ways to take the whole site down by editing it. Worth doing
  deliberately, not as a side effect.
- **`/cd`, `/multimedia` and `/sponsors` stay hidden.**

### The two constraints E2 inherits

E was scoped in the 2026-08-31 spec as *"keep Scène, polish it"*: mobile
ergonomics, spacing rhythm, motion, image treatment, touch targets, and
specifically the members' area on a phone at a rehearsal, which is the site's
only repeat-use surface. **E1 did the ergonomics half of that and shipped it**
(PR #63); what is left is spacing rhythm, motion and image treatment, which are
the parts that need a design decision rather than a measurement.

**Do not restart the design** — read
`docs/superpowers/specs/2026-08-29-visual-foundation-design.md` first, and note
its warning that neon-on-black is the real identity. Then read the three E1
documents, because they record decisions E2 must not silently reverse:
`docs/superpowers/specs/2026-08-31-e1-mobile-and-component-library-design.md` and
`docs/superpowers/specs/2026-09-01-e1c-one-events-page-design.md`.

Two things changed after the original scoping and still bind E2:

1. **The display face is now Bungee, not Lilita One** (PR #58). It is a signage
   face whose **lowercase glyphs are drawn as capitals**, so every heading
   renders in caps whatever the source text says. A heading cannot be
   sentence-case while this face is in use. That is a design constraint E
   inherits, not a bug.
2. **The site has almost no imagery left.** `web/public/assets/img/` holds three
   files: the logo, `CD_img.png` (referenced only by the hidden
   `Cd.tsx`), and the parrain/marraine photograph. Everything else is a dashed
   placeholder box.

   "Image treatment" was in E's original scope and there are no longer any
   images to treat. **E2a answered this**: `PhotoPending` is one line, and
   `/canetons` is 2134px on a phone rather than 3034px. The photographs are
   coming back, so the page is designed for its photographed state — see the
   E2a framing above before changing anything there.

   **`tools/image-budget.mjs` now guards what arrives.** Longest edge 1920px,
   600 KB, exemptions by name in the file, and an exempt name is still held to a
   4000px / 2 MB ceiling so a camera original cannot sail through under one. It
   runs in `npm run check`. This matters because the band is about to hand over
   eight re-shot photographs, and the legacy site still serves 37.5 MB of them
   including a 19.8 MB 6048x4024 original.

### What is hidden, and how to bring it back

Three pages have their route and nav entry **commented out** — components and
content untouched:

| Page | Why |
| --- | --- |
| `/cd` | Headed "2022 - Les Canetons ont 20 ans !!!", still said the CD "vient de sortir" |
| `/multimedia` | A single France 3 reportage from 2016 |
| `/sponsors` | Hidden on request, *after* its links had been audited and repaired |

Uncommenting the import, the `<Route>` and the nav entry is the whole reverse —
see the comment block in `web/src/routes.tsx`, which also records why this is
commenting-out rather than a feature flag (a flag needs a key in
`api/.env.example`, and the deploy's config-shape preflight refuses against any
server whose `.env` lacks it).

`routes.test.tsx` asserts all three fall through to the 404 view, so "hidden"
cannot quietly become "still reachable".

### ⚠️ PROD IS BLOCKED: the site is full of visible placeholders

Two placeholder components, both deliberate, both visible to any reader:

```bash
grep -rl "<Tbd" web/src/pages           # missing names and numbers
grep -rl "<PhotoPending" web/src/pages  # missing photographs
```

`Tbd` covers 4 pages / **23 rendered fields**; `PhotoPending` covers 3 pages /
**10 photographs**. Counted in a browser against TEST on 2026-09-03, which is
the only method that gives a true number:

| | `Tbd` | `PhotoPending` |
| --- | --- | --- |
| `/comite_teamdirection` | 9 | 0 |
| `/canetons` | 6 | 8 |
| `/moniteurs` | 6 | 1 |
| `/commencement` | 2 | 0 |
| `/accueil` | 0 | 1 |
| **total** | **23** | **10** |

> This file previously said **17**, omitting `/moniteurs`' six. Do not count
> occurrences and report that as the number: several sit inside a `.map()`, so
> `grep -o | wc -l` understates it *and* picks up the components and their own
> tests. `grep -rl` on `web/src/pages` tells you which pages; only rendering
> them tells you how many fields.

There is deliberately **no `tel:` link on a placeholder** — a clickable wrong
number dials a stranger. Each affected block offers `comite@lescanetons.org`
instead.

TEST and QA are behind HTTP Basic Auth so only the band sees these. **PROD is
public and has never been deployed.** Deploying it now would publish
"à compléter" where the committee should be, and dashed boxes where the band
should be. Nothing in CI enforces this — it is a content gate, and this
paragraph is the enforcement.

### Two things left undone on TEST

1. **`config.php` is still on the TEST server** and still holds live DB
   credentials from the old app. It is a PROTECTED basename, so no tool will
   remove it — delete it by hand, once, in an FTP client. Nothing reads it; the
   SPA fallback already makes it unreachable over HTTP.
2. **Nobody has logged in through a browser yet.** The API answers correctly and
   guests get 401, but the full Sanctum cookie round-trip — and the check that
   an admin is *refused in place* on `/inscriptions_utilisateurs` rather than
   bounced to login — has not been exercised by a human. Do that before trusting
   the members' area.

### QA and PROD are untouched, and are NOT ready

Both are still pre-cutover. Before either can take a deploy:

- **Place `api-laravel/.env` by hand.** Neither has one. Nothing recreates it,
  and a server without it 500s every `/api/*` request. It must exist *before*
  the first deploy.
- **Expect the mass-delete brake to trip.** Both are bootstrap runs with no
  `.sync-state.json`, where deletion is authoritative. `-- --dry-run` first,
  read the list, then `-- --force-delete`.
- **They would have hit the FastCGI 301 bug** (see the traps section) had they
  been deployed before `2026-08-31-f120b9f`. Deploy that tag or later.
- **The `.htaccess` must be swapped by hand right after the deploy**, with
  `npm run put-overlay:<env>`. A deploy alone deletes the old `index.php` and
  leaves the site broken until that lands.

## The numbers that mean "green"

Recorded 2026-09-03 at `748241a`, every one of them run, with the dev stack up.
The pre-E2b column is `80633d6`.
If a fresh checkout does not match these, something moved before you started.

| Command | Expect |
| --- | --- |
| `npm run check` | exit 0 |
| `npx vitest run` | **258** tests, 40 files (234/36 before E2a) |
| `npm run test:js` | **140** passed, unchanged by E2b (122 before E2a's image guard) |
| `npm run test:e2e` | **31** passed (25 before E2b, 20 before E2a) |
| `npm run build` | exit 0, `dist/build/` holds `index.html`, `assets/`, `api-laravel/` |
| `npm run smoke` | 13/13 |
| `docker compose exec -w /var/www/html/api-laravel web php artisan test` | **238** passed (730 assertions) — unchanged by E2a, which touched no API |
| `du -sh web/public/assets/img/` | **656 KB**, 3 files (44.5 MB before 2026-08-29) |

`npm run check` does **not** build and does **not** run the Laravel suite. Run
both separately. In Git Bash prefix the `docker compose exec` with
`MSYS_NO_PATHCONV=1`; PowerShell is fine as-is.

**`npm run check` gained `guard:images`** in E2a — it is the last step, after
`guard`, and prints two "exempt but not in the tree" notes for `comite.jpg` and
`Flyer.jpeg` before its OK line. Those notes are expected: both files were
deleted in `de750d9` and stay on the exemption list so restoring them does not
trip a guard that was never about them.

**The e2e suite now runs in CI**, which it did not before E2a — no workflow
invoked Playwright at all, so a broken spec could reach `main` unnoticed, and
did once during E1c. The `e2e` job is in `ci.yml` and is in `deploy-test`'s
`needs` list, so a red e2e blocks the TEST auto-deploy. It runs `--mode mock`
(MSW, no Docker), so it is **not** proof of the API contract — that is
`tests-api` and `openapi-drift`.

**Run the JS suites from PowerShell, not Git Bash** — see the trap below. From
Git Bash every test file fails to collect at once, which looks exactly like a
catastrophic regression and is not one.

## Branch and merge history

`main` is the trunk again. Everything lands by squash merge — the repo permits
no other kind. In order, all on 2026-08-31:

| PR | Squash | What |
| --- | --- | --- |
| #54 | `cfde526` | the SPA cutover |
| #55 | `f120b9f` | the FastCGI 301 fix — **tag `2026-08-31-f120b9f`, the rollback point** |
| #56 | `c03624f` | this handover, rewritten post-cutover |
| #57 | `243232d` | font cache headers + woff2 MIME type |
| #58 | `6b75c61` | Bungee replaces Lilita One as the display face |
| #59 | `61eb91e` | the content audit |
| #60 | `85bf1f9` | acting on the audit answers |
| #61 | `de750d9` | every photograph dropped, `/sponsors` hidden, print button removed |
| #63 | `c7b95fe` | E1a+E1b+E1c — the events filter, the component library, the phone pass, and the two events pages merged into one |

Then on 2026-09-03:

| PR | Squash | What |
| --- | --- | --- |
| #64 | `0699ecd` | this handover, updated for E1 |
| #65 | `022f8b9` | E2a — the register index, the one-line `PhotoPending`, `tools/image-budget.mjs`, `/canetons` e2e coverage, and the `e2e` CI job |
| #66 | `fc13683` | this handover, updated for E2a |
| #67 | `3fdae68` | CI skips the build, the suites and the deploy for docs-only changes |
| #69 | `80633d6` | the duck mark split from the wordmark in the header; the badge moved to `/accueil` |
| #70 | `748241a` | **E2b — `/accueil` as a front door.** The hero, `NextEvent`, `DestinationCards`, the souper banner, `ScrollToTop`, `/admin` retired to a redirect, `web/e2e/accueil.spec.ts` |

Tag `cfde526` is deliberately NOT a rollback target: its `.htaccess` template
takes the API down on the real host.

**The per-step history lives on `archive/spa-cutover-history`** (140 commits,
head `70a2661`). **Do not delete that branch.** The repo only permits squash
merges, so `main` shows the cutover as two opaque commits; every SHA that
`docs/` references — notably `dcd7862` for the parity reference
`git show dcd7862^:app/pages/<page>.php` — is reachable only through that
branch. `feat/spa-cutover` was auto-deleted on merge despite
`--delete-branch=false`; the archive branch was pushed to recover it.

## Where the three servers actually are

| | Runs | Notes |
| --- | --- | --- |
| **TEST** | `main` @ `4f17eb3` — **the SPA, with E2b** | Auto-deployed 2026-09-03 by CI on the E2b fix merge, and **verified in a browser** (list below). Note the E2b merge itself (`748241a`) did NOT deploy — its `e2e` job failed on Linux, so `deploy-test` was skipped; `4f17eb3` is what landed. `.htaccess` carries the SPA fallback + the fixed `.php` exclusion + font headers. `api-laravel/.env` present. `config.php` **still there — delete by hand.** Behind HTTP Basic Auth. |
| **QA** | pre-cutover artifact | Old `api/` and `sql/` trees, **no `api-laravel/`**, no `.sync-state.json`, **no `api-laravel/.env`** |
| **PROD** | pre-cutover artifact | Same. `/sanctum/csrf-cookie` 404s there, so the Laravel API has never been deployed to it |

Consequences worth knowing before any deploy:

- **QA and PROD have no `api-laravel/.env`.** Nothing recreates it, and a server
  without it 500s every `/api/*` request, so it must be placed by hand *before*
  the first deploy that dispatches into Laravel. See `staging/README.md`.
- **Their first deploy is a bootstrap run** (no `.sync-state.json`), where
  deletion is authoritative and will remove the entire old tree. It will trip
  the mass-delete brake. Review a `-- --dry-run` first, then `-- --force-delete`.
  (TEST did **not** trip it: 406 stale of 6915 is under the 20% threshold.)
- **Each server still has a dead `config.php`** holding live DB credentials. The
  deploy never removes a protected basename, so delete it by hand, once per
  server.
- `robots.txt` and `deployment.json` are unreachable over HTTP on every
  environment — the fallback catch-all serves the shell for them. That is by
  design (it is what hides `api-laravel/.env`), not a regression. Verified again
  on 2026-08-31.
- The souper feature is flag-gated per server via `SOUPER_SIGNUP_ENABLED` in
  that server's `api-laravel/.env`. A server with it off genuinely has no
  `/signup`, `/signup_thanks` or `/signups_admin`.
- **Environment-dependent values now live only in `api-laravel/.env`.** Config
  is not cached (nothing runs `php artisan config:cache`, and the artifact's
  `bootstrap/cache/` holds only `packages.php`/`services.php`), so editing that
  file takes effect on the next request — no deploy, no cache clear. If anyone
  ever runs `config:cache`, `.env` edits stop working until `config:clear`.

## What is done

Plan 1 (clean slate) is complete: no `app/`, no root Composer project, the tree
is `api/ + web/ + tools/ + docs/`, and `npm run build` emits `index.html` +
`assets/` + `api-laravel/`.

Plan 2 (shell and first page) is complete as well, all ten tasks. `/planning_repet`
is fully ported: the public list, the admin create/edit/delete form, French field
errors against the offending inputs, and both a unit suite and a Playwright
smoke. It was verified against the REAL Laravel API on the dev stack, not only
against the mocks — create, edit and delete each persist across a reload, and an
over-long title comes back as “Titre est trop long (maximum 255 caractères)”.

The remaining work was decomposed on 2026-08-29 into four sub-projects, each
getting its own spec, plan and implementation cycle — see
`docs/superpowers/specs/2026-08-29-auth-and-contact-design.md` for the table.
**All four are done:**

| | Routes | Status |
| --- | --- | --- |
| A. Content pages | accueil, historique, canetons, cd, commencement, moniteurs, sponsors, multimedia, comite_teamdirection | **done** — split into A1 (the visual foundation) and A2 (the nine pages) |
| B. Auth and contact | authentification_inscription, contact, confirmation | **done** |
| C. Members' area | sinscrire, inscriptions_utilisateurs, admin, inscriptions_admin | **done** |
| D. Souper | signup, signup_thanks, signups_admin | **done** — the last one |

The parity reference is `git show dcd7862^:app/pages/<page>.php` and the live
site.

**B — auth and contact** landed `/authentification_inscription` (login *and*
logout, which the SPA had no way to do before), `/contact` and `/confirmation`.
Verified against the real Laravel API in 21 checks: all three seeded accounts log
in through the form and survive a reload, only `demo.admin` sees the admin form,
a contact message reaches `contact_messages`, and an over-long subject comes back
as “Sujet est trop long (maximum 255 caractères)” against the offending input.

**A1 gave the site a design**: the *Scène* direction, chosen from three mocked-up
options (https://claude.ai/code/artifact/ec2ff76f-b64a-4fd0-a5ed-89c5ab2c5a3b).
Near-black chrome, light page body, violet as the interface accent, Lilita One
and Karla self-hosted through Fontsource. The image directory went from **44.5 MB
to 6.1 MB** at the same time.

**C — the members' area** carried two things worth knowing about:

- The register counts on the summary are **derived from the response**, not from
  the hardcoded array of nine French instrument names the old page carried. The
  endpoint returns every user with their instrument, so the list falls out of
  the data and cannot drift from the `instruments` table.
- `/admin` is a **hub** now — links to the planning page and the summaries —
  rather than the old two buttons, both of which had become redundant. That was
  an approved design change, not a port.

C also wired the first `RequireAuth` / `RequireCapability` guards; before it,
`grep RequireAuth web/src/routes.tsx` returned nothing and nothing exercised the
bounce end to end because there was no gated URL to bounce from.

**D — the souper** built the three flag-gated routes and the `/accueil`
call-to-action together, because the CTA's two buttons link to `/signup` and
`/signups_admin`. `GET /api/config` already returned `occasion` with every field
the CTA needs (`title`, `subtitle`, `dateDisplay`, `teaser`, `invitation`), so
the pages read the copy from the session rather than fetching anything extra.
The CTA splits on the `view_summary` capability, **not** on being logged in — a
`user` sees the same public half an anonymous visitor sees.

**Read the palette spec before touching the colours.** The old per-page CSS looks
like a decade of drift — magenta headings on one page, two blues on another —
and it is not. The band is a youth Guggenmusik that performs in **UV costumes at
night**; those colours came from the band's own look. Neon on black IS the
identity, and a tasteful white site would look like a different band. Open
`web/public/assets/img/canetons.jpg` before deciding otherwise.

### Open content questions — for the band, not for code

**ALL THREE WERE ANSWERED ON 2026-08-31** and are kept here only so the reasoning
survives. The full set of fourteen audit questions and their answers is in
`docs/content-audit-2026-08-31.md`.

1. **Who directs the band?** → **Lilou Keller and Anaïs Meuwly.** `/historique`
   was right; the other two pages were stale and are fixed.
2. **`comite.jpg`** → dropped entirely in PR #61, along with every other
   photograph.
3. **"Marc-Jérôme" / "Marc-Jérome"** → moot: both occurrences were names, and
   both are `<Tbd />` placeholders now. If the name comes back, pick one
   spelling.

The original text follows.



1. **Who directs the band?** `/historique` says Delphine Maillard and Laura
   Mantel *"passent à présent le flambeau"* to Lilou Keller and Anaïs Meuwly,
   while `/comite_teamdirection` still lists Laura Mantel as Responsable Team
   Direction and the Direction musicale as *"Laura Mantel et Delphine
   Maillard"*. The live site has contradicted itself for a while; both pages
   were ported as they read.
2. **`comite.jpg` is not a photograph of the committee.** It is a stock picture
   of actual ducklings, sitting under the heading "Le comité". Its alt text now
   describes the ducklings, because telling a screen-reader user there is a
   photo of the committee when there is not is worse than being vague. If a real
   committee photograph exists, dropping it in fixes both.
3. **"Marc-Jérôme" or "Marc-Jérome"?** `/canetons` has the circumflex,
   `/moniteurs` does not. Both spellings are in the old PHP; both were carried
   across.

## Three contract defects that were fixed — do not reintroduce them

All were in committed code, none was caught by any test, and each made the data
layer silently wrong. **There are no known outstanding ones.**

1. **The mutator must return orval's `{ data, status, headers }` envelope.**
   Every generated signature declares it, so returning the bare body
   type-checked at every call site and was `undefined` at runtime. Guarded from
   both sides now — two runtime tests in `web/src/api/http.test.ts` and a
   compile-time one in `contract.test.ts` — because neither alone would have
   caught it. Call sites read `query.data.data`: the outer is TanStack Query's,
   the inner is the envelope.
2. **`GET /api/events` was typed `string[]`.** Scramble cannot infer through
   `Collection::map`, so the endpoint the SPA is built on had no usable type. A
   `#[Response]` attribute on `EventController::index()` fixes it, and it must
   be a **literal** — Scramble resolves a `@phpstan-type` alias to a
   property-less object. That leaves the shape written twice, and
   `EventShapeContractTest` fails if they diverge.
3. **`GET /api/responses` was typed `string[]` too**, for the identical reason,
   and was fixed the identical way on 2026-08-29 —
   `api/tests/Feature/ResponseShapeContractTest.php` is the guard. It differs
   from `EventShapeContractTest` in needing a database: the event shape has a
   seam (`Event::toFrontendShape()`) callable on an unsaved model, and the
   response shape does not, so it asks the endpoint instead.
4. **`GET /api/signups` was typed `string`** — the whole summary, a bare string —
   for the third instance of the same failure, this time through both
   `Collection::map` and `SignupStats::compute()`. Fixed in D, the same way, and
   guarded by `api/tests/Feature/SignupShapeContractTest.php`.

   That test differs from its two siblings in **walking the shape recursively**:
   it compares key sets at every level, not just the top. That is not
   thoroughness for its own sake — the flat version was written first, and it
   accepted a nested `occasion: string` that the recursive one caught. It also
   asserts specifically on the `application/json` branch of the 200, because
   `index()` returns `JsonResponse|StreamedResponse` (`?format=xlsx` streams a
   spreadsheet) and the spreadsheet content type is legitimately a string; an
   assertion that took whichever branch came first would pass on the xlsx one
   and prove nothing about the JSON the SPA parses.

**`openapi-drift` would not have flagged any of these** — it checks the
committed document matches what Scramble emits, not that the shape is right.

## Decisions the souper took that the code cannot explain

- **The table-name datalist was dropped on purpose.** The old public form
  server-rendered a `<datalist>` of every existing table name to anonymous
  visitors — and the field's own label is *"nom de famille ou nom de table"*, so
  the page published the surnames of everyone who had already reserved, to
  anyone who opened it. The free-text field and its reworded hint are the
  replacement. The accepted cost is real and should be stated plainly: a typo
  splits a family across two tables and nothing warns them. The admin summary
  groups by exact string, so it is at least *visible* there and fixable in the
  database.
- **Per-person menu rows were kept over a quantity stepper.** A stepper would
  produce an identical payload — the API only ever counts `menus[]`, and their
  order is never read — and is fewer clicks for a table of eight. It was
  rejected anyway, as a visible change to a page returning visitors have already
  used. This is a port, and the stepper is a redesign.
- **The mocked backend answers 400, not 422.** `ApiError::validation()` returns
  **400**, and `OpenApiDocumentTest` explicitly pins that 422 is never used
  anywhere in the API. The MSW handlers had been wrong about this for `/contact`
  since before the souper existed; both it and the new signup handler are
  correct now. A mock that answers the wrong status trains the SPA against an
  API that does not exist.

## Lessons from D that are not in any file

- **A green suite still cannot see layout.** `/signups_admin` at 390px had
  `w-full` on the table inside its `overflow-x-auto` wrapper, so the table
  *squeezed* instead of scrolling: phone numbers stacked five lines deep and the
  Total column hung off the edge. Every automated check passed — including the
  one asserting the page body does not scroll sideways, which was true and
  irrelevant. It was found by screenshotting the page and looking at it. There
  is now an e2e test pinning that the table scrolls inside its own panel.
- **The honeypot's transmission is pinned by a unit test, not by e2e**, and it
  has to be. A trapped submission returns a plain `201 {"ok":true}` — byte for
  byte what a real success returns, deliberately, so a bot learns nothing —
  which means Playwright can observe no difference at all. Only the request body
  differs. The test asserts on what is submitted, not on what is rendered; a
  rendering test would have passed against a honeypot that was never sent.

## Verified against the real API — 2026-08-29

D was verified against the real Laravel API on the dev stack, not only the
mocks. Nine checks, all passing:

1. a reservation submitted through `/signup` reaches the `signups` table with
   `occasion: anniversary-supper`;
2. an over-long first name comes back as
   **“Prénom est trop long (maximum 255 caractères)”**, rendered against its own
   input;
3. a malformed address comes back as
   **“E-mail n'est pas dans un format valide”**, likewise against its own input;
4. the admin summary at `/signups_admin` counts the new reservation;
5. the export link downloads a real `.xlsx`;
6. that file carries the formula-injection guard — the leading `+` of a phone
   number is quoted;
7. `demo.user` is refused **in place** at `/signups_admin`, and
   `GET /api/signups` is never issued at all — the guard refuses before the
   query mounts, so the refusal is not merely cosmetic;
8. the confirmation mail arrives in Mailpit;
9. a honeypot submission returns 201 while storing no row and sending no mail.

**The dev `signups` table now holds one legitimate row** from that verification
(id 1, `anniversary-supper`). Do not assume a clean slate; the Laravel suite is
unaffected, since it uses the throwaway `laravel_api_test` database.

## Starting E2 — what the phone pass left behind

**E2 now HAS its specs** — three of them, dated 2026-09-01, one per round; see
"E2 is three rounds" near the top. E2a is shipped. So the next session goes
straight to written plan → execute → look at the rendered pages, and does **not**
re-brainstorm. Do not skip to editing CSS either.

Everything from here to the end of this section was written before E1 shipped
and not fully revised since. It is still accurate about the site's traps, but
read it against two rounds of work: E1 did the ergonomics (the 44px floor, the
phone nav, the one-tap answering, the container widths) and **E2a did
`/canetons` and `PhotoPending`**. Where this section and the top of the file
disagree, the top is newer.

### Read first, in this order

1. `docs/superpowers/specs/2026-08-29-visual-foundation-design.md` — why the
   palette is what it is. Its warning is load-bearing: the band is a youth
   Guggenmusik performing in UV costumes at night, neon-on-black *is* the
   identity, and a tasteful neutral site would look like a different band.
2. `web/src/styles.css` — the whole design system: `@theme` tokens, the sticky
   footer chain through `#root`, and the comment explaining why Bungee replaced
   Lilita One.
3. `docs/content-audit-2026-08-31.md` — what the pages now say, and what is
   deliberately a placeholder.

### Look at the site before designing anything

This has found a real defect in every single sub-project, including one that a
fully green suite could not see (a flyer panel that duplicated the four cards
above it). The loop that works:

```bash
npm run build                      # :8090 serves the BUILT artifact
# then screenshot every route at 1280 and 390 with Playwright,
# and read the images -- do not trust the test suite for layout
```

### What E is actually facing

- ~~**`/canetons` is nine stacked dashed placeholder boxes**~~ — **done in E2a.**
  The placeholders are single lines, the page has a register index, and it is
  2134px at 390px. Read the E2a framing at the top before changing it: the page
  is deliberately designed for its *photographed* state, which is longer still.
- ~~**`/accueil` is a heading and one placeholder box**~~ — **done in E2b (PR
  #70).** It is now a hero, a live next-event block and four destination cards;
  read "What E2b shipped" at the top before changing it, especially the three
  measurements, since two of them contradict what looks obvious.
- **Headings are all-caps whatever the source says**, because Bungee's lowercase
  glyphs are capitals. Sentence-case headings are not available.
- **The desktop nav is 10 items** and wraps to two rows; the phone nav is a
  hamburger. Three pages were hidden, which already shortened it.
- **The members' area is the only repeat-use surface** — `/planning_repet`,
  `/sinscrire`, `/inscriptions_utilisateurs`, `/inscriptions_admin`. Per the
  original scoping, this is where mobile ergonomics matter most: someone
  checking on a phone, outdoors, whether they play on Saturday. The nine public
  pages are read once by a stranger.
- **There are no print styles.** A print stylesheet existed briefly for a
  recruitment flyer and was removed on request. Nothing depends on it.

### What E1's review pipeline caught

E1c ran every task through an independent spec review and a code-quality review,
both dispatched as subagents with no access to the implementer's reasoning. Four
defects came out of that which a green suite had not:

1. **A hint rendered on two lines.** `Card`'s base classes are `flex flex-col`;
   used with `asChild` they land on the `<p>` itself, so an inline link and the
   text after it became flex ITEMS and the sentence stacked. Every assertion
   passed the whole time, because `toHaveTextContent` reads `textContent` and
   textContent ignores layout. **Only opening the page found it.**
2. **`web/e2e/planning.spec.ts` was failing** on a renamed heading, invisible
   because `npm run test:web` does not cover `web/e2e/`. Run both.
3. **An e2e guard test could not detect the bug it existed for.**
   `InscriptionsAdmin` renders the same `<h1>` in its success and its no-id
   branches, so a dropped `returnTo` query string would still have passed.
4. **`opacity-75` dimmed a newly-added link.** CSS opacity is multiplicative and
   no child can undo it, so wrapping an interactive control in a dimmed card
   dims the control.

The transferable lesson, and it is the same one the phone-overlap defect taught:
**a green suite is not a rendered page.** Three of those four are invisible to
any assertion about roles and text. Screenshot the states and read them.

Two guards were also proven rather than assumed, by reintroducing the bug and
watching the test fail. Do that for any test whose whole purpose is to catch a
regression — a guard that cannot fail is worth nothing, and one of E1's would
have silently asserted nothing forever.

### What not to do

- Do not restart the design or neutralise the palette.
- Do not reintroduce photographs as decoration. Every one was removed
  deliberately, on the assumption it is out of date. The parrain/marraine
  photograph is the single exception and is deliberately set apart.
- Do not "fix" the French inconsistencies that were ported on purpose —
  `Nom:` versus `Nom :`, the title-cased "Liens Amis". If they are worth
  settling, settle them as an explicit E decision with the band, not silently.

## Traps worth knowing before you touch anything

### The one that took TEST down, minutes after the cutover

**`easy-hebergement` runs PHP through a FastCGI wrapper, and that changes the
URL mod_alias sees on a re-entered rewrite pass.** Not
`/api-laravel/public/index.php` but:

```
/cgi-bin/php5.fcgi/api-laravel/public/index.php
```

So the start-anchored guard `^/(?!api-laravel/)(.*)\.php$` tested the characters
right after the leading slash — `cgi-bin/` — the exclusion never fired, and
**every `/api/*` and `/sanctum/*` request 301'd** to
`/cgi-bin/php5.fcgi/api-laravel/public/index`. The API was entirely down while
every public page rendered perfectly, which is exactly what makes this class of
bug easy to ship.

The fix is `(?!.*api-laravel/)` — match `api-laravel/` **anywhere** in the path,
so it holds whatever prefix the host's PHP wrapper adds. Do not "tidy" that `.*`
away; it looks redundant and is not.

**Two reasons nothing caught it, both now closed:**

1. **It is not reproducible locally.** The Docker stack serves PHP without that
   wrapper path, so `npm run smoke` passes 13/13 against a build that takes the
   real API down. **Local green does not mean the host is green** for anything
   touching `.htaccess`.
2. **The regression test was a substring check.** It asserted the pattern
   *contained* `(?!api-laravel/`, which stayed true while the rule was broken.
   `tools/build-overlays.test.mjs` now compiles the actual pattern and runs the
   fcgi-prefixed path through it. Assert behaviour, not spelling.

**How to check this in seconds after any `.htaccess` change:** request
`/api/config` with `redirect: 'manual'`. A `301` whose `Location` contains
`cgi-bin` means this bug is back. A `200` with JSON means the dispatch works.

### Check a display font's glyph data BEFORE adopting it

Lilita One was dropped on 2026-08-31 because its woff2 ships incorrect `glyf`
bounding boxes on **104 of its 210** outline glyphs, so Firefox's OpenType
Sanitiser logged a warning for every heading glyph it drew. Nothing rendered
wrong — it was console noise — but it is avoidable noise, and several other
fonts in the same heavy-display register are worse.

Measured with fontTools in a throwaway venv (this is not a project dependency,
and does not need to become one):

```bash
python -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
/tmp/fontenv/bin/python - <<'EOF'
from fontTools.ttLib import TTFont
f = TTFont('node_modules/@fontsource/<name>/files/<name>-latin-400-normal.woff2')
glyf = f['glyf']
bad = 0
for n in f.getGlyphOrder():
    g = glyf[n]
    if getattr(g, 'numberOfContours', 0) == 0:
        continue
    old = (g.xMin, g.yMin, g.xMax, g.yMax)
    g.recalcBounds(glyf)
    bad += old != (g.xMin, g.yMin, g.xMax, g.yMax)
print(bad, 'glyphs with an incorrect bbox')
EOF
```

Results recorded 2026-08-31, so nobody re-measures: **clean** — Bungee (0/343),
Anton, Archivo Black, Alfa Slab One, Passion One, Righteous, Fredoka One, and
Karla (the body face, 0/274). **Not clean** — Lilita One (104/210), Bowlby One
(13, and no latin-ext), Titan One (9).

**This is deliberately NOT a CI test.** Doing it in Node means either a new
dependency or hand-parsing the woff2 glyf transform, and a partial parser would
give false confidence about the exact thing it is meant to guarantee. A display
face changes roughly never; the check is a minute by hand at the moment of
choosing, which is the only moment it matters.

Also worth knowing: **Bungee's lowercase glyphs are drawn as capitals.** It is a
signage face, so every heading renders in caps whatever the source text says.
That is the look, not a bug — but it means a heading cannot be sentence-case
while this face is in use.

### `npm run dbmigrate:<env>` defaults to APPLY, not dry-run

`tools/dbmigrate.mjs` builds `?mode=apply` unless you pass `-- --dry-run`. The
endpoint defaults to dry-run for anything that is not exactly `apply`, but the
tool sends `apply`. Do not point it at PROD casually.

### `build-overlays.mjs` deletes the directory it builds into

It opens each env with `rmSync(outDir, {recursive: true, force: true})`, so
anything you leave in `dist/overlay/<env>/` is destroyed by the next
`build:overlay`. This is why `put-overlay` writes its rollback backup to
`dist/htaccess-backups/` instead. It also substitutes only the *quoted*
`AuthUserFile "__HTPASSWD_PATH__"` and deliberately leaves the bare token in a
NOTE comment — so a guard matching the bare token refuses every correctly built
test/qa overlay.

### A deploy alone does not turn a server over — it breaks it

`.htaccess` is server-owned and never uploaded by a deploy. The deploy uploads
the SPA, then **deletes** the old `index.php`; until the new `.htaccess` lands
the site is down. Order: deploy, then **immediately**
`npm run put-overlay:<env>`. On TEST that window is free (Basic Auth, no
visitors). On PROD it is real downtime, and there is no atomic swap over FTP.


**Run the JS suites from PowerShell, not Git Bash.** Git Bash reports the cwd
with a **lowercase** drive letter (`c:\Workspace\...`) where PowerShell reports
`C:\`. Vitest 4 keys module resolution off that path, and from Git Bash it fails
to collect **every single test file** with *"Vitest failed to find the runner"*,
pointing at `web/src/setupTests.ts`. It presents as 29 red files and a
catastrophic regression, and it is a shell difference. This has cost two
debugging sessions; it is now also in `CLAUDE.md`.

**The `assets` container needs two env vars, both set in `docker-compose.yml`.**
`VITE_API_PROXY_TARGET=http://web`, because inside that container
`localhost:8090` is the container itself — with the default, every API call
answers 502 and the SPA looks broken with no clue why. And `VITE_USE_POLLING=1`,
because bind-mount filesystem events do not reach it on Docker Desktop; without
polling an edit never triggers HMR, the dev server keeps serving the previous
version, and the only thing that helps is restarting the container, which nobody
guesses.

**`npm run check` does not build and does not run the Laravel suite.** Building
was removed from it on purpose: `build:web` empties `dist/build/`, which would
delete `api-laravel/` out from under the running stack. The Laravel suite needs
a database:

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

In Git Bash prefix that with `MSYS_NO_PATHCONV=1`, or the `-w` argument is
rewritten to a Windows path and Docker rejects it. PowerShell is unaffected.

**`.env.test` / `.env.qa` / `.env.prod` use `FTP_PASSWORD`; the deploy CLI reads
`FTP_PASS`.** This is not a bug to fix — a previous session already tried.
Inject it for a one-off command instead:

```powershell
Get-Content .env.test | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] } }
$env:FTP_PASS = $env:FTP_PASSWORD
node tools/deploy/cli.mjs test --status
```

**Never `docker compose up` directly.** `npm run dev` generates
`dist/overlay/docker/.htaccess` first; without it Docker creates a *directory*
at that path and the `web` container refuses to start. Relatedly, the
`dist/build` mount must **not** be `:ro` — the `.htaccess` mount nests inside
it and Docker cannot create the mountpoint against a read-only parent.

**Two `.htaccess` lookaheads are load-bearing.** The `.php` legacy redirect
excludes `api-laravel/`, or the dispatch's own rewrite target gets 301'd and the
entire API answers 301 while every page still looks fine. The `.html` one
excludes `index.html`, or the fallback's own output gets 301'd and every URL
redirect-loops. Both have regression tests; the first also has a smoke check.

**Testing Library needs explicit `cleanup()`** here — this project imports
`test`/`expect` rather than using Vitest globals, so RTL's auto-cleanup never
registers. It is in `web/src/setupTests.ts`. Without it renders accumulate and
the next test fails with "Found multiple elements", which reads like a component
bug and is not one.

**The capability matrix is not a hierarchy, and the members' area is where
that bites.** `respond` belongs to user and moderator; `admin` holds
`manage_events` and `view_summary` instead. **An admin cannot respond** — on
`/sinscrire` a member sees "S'inscrire" and an admin sees "Résumé", different
buttons on the same row. The `/accueil` souper CTA splits the same way, on
`view_summary` rather than on being logged in. Every intuition about roles says
otherwise, and the SPA's guards are UX only, so a mistake will not surface as a
403.

**`Config200Occasion` types every field as a string LITERAL** — `title:
"Souper des 25 ans des Canetons"`, `maxGuests: 30`, and so on, because Scramble
read them off `App\Support\Occasion`'s constants. Any mock or fixture typed as
`Config200` must use those exact strings or it will not compile.

**MSW's mocked session lives in `sessionStorage`, which pages in one Playwright
context share.** A script that logs in as one user and then another in the same
context lands on the already-logged-in view instead of the form. Use a context
per role. And below `md` the nav collapses behind the hamburger, so the username
link is not a usable "logged in" signal at 390px — wait for the login form to
detach instead.

**An accessible name keeps `&nbsp;` as a literal U+00A0.** It is not collapsed
to an ordinary space, and the two are indistinguishable by eye. A test asserting
on a heading that contains one — `/cd`, `/commencement` — needs the real
character. The plan for those pages originally claimed the opposite and was
wrong twice over: its prose said "already contains the real character" while its
own code fence held an ASCII space. Both implementers caught it by rendering the
component and reading the codepoints instead of trusting the document.

**Every route had two `<h1>`s until 2026-08-29** — the header's brand and the
page's own title. The brand is a `<p>` now. If you add a page, its title is the
document's single `h1`; a script that walks every route and counts them is three
lines of Playwright and worth re-running after any layout change.

**Adding an npm dependency silently unstyles :5173 until the `assets` container
is restarted.** That service keeps `node_modules` in a named volume and installs
with `npm ci` at start, so a package installed on the host is simply absent
inside it. Tailwind's Vite plugin then fails to generate any CSS — the page
renders with structure but no colours, no fonts, no chrome — and the ONLY signal
is one line in `docker compose logs assets`:
`Can't resolve '@fontsource-variable/karla'`. Nothing in the browser, the tests
or the terminal says a word. `docker compose restart assets` fixes it in about
four seconds.

**`NavLink` ignores an `aria-current` you pass it.** It gates its own
`aria-current` on an internally-computed `isActive` that matches `to` literally
against the URL — which knows nothing about `ACTIVE_ALIASES` in `Layout.tsx`, so
on `/inscriptions_admin` the "Inscriptions" item was never marked current no
matter what was passed. The nav items are plain `Link`s now, with `aria-current`
and `className` both driven by the same `active` expression.

**A design change is only checkable by looking at it.** This has now bitten
three times. Two defects survived a fully green `npm run check`, 132 unit tests,
11 e2e tests and a clean build: the footer floated halfway up short pages (the
old `main.css` sticky-footer pattern was never ported, and it was invisible
while the footer had no background), and the env ribbon sat mostly outside the
viewport. The third was the squeezed admin table described above. Screenshot the
routes — driving Playwright and reading the PNGs works well — rather than
trusting the suite.

**Playwright's `getByLabel` is a case-insensitive SUBSTRING match; Testing
Library's is exact.** The same label works unqualified in a Vitest test and
fails strict mode in an e2e one: `getByLabel("Nom:")` also matches `"Prénom:"`,
because "nom:" is its tail. The souper form makes this worse still — it has
"Nom", "Prénom" *and* "Nom de table" on one page. Every locator in
`web/e2e/auth.spec.ts` and `web/e2e/souper.spec.ts` passes `{ exact: true }`,
including the ones that do not collide today — one added field is all it takes,
and the failure reads as a bug in the page.

**Nothing in Playwright's non-waiting API waits for the boot gate.**
`isVisible()` and `count()` return immediately, and `SessionProvider` renders
`null` until `GET /api/config` and `GET /api/user` resolve — so a check fired
straight after `page.reload()` or `page.goto()` reports "logged out" for a
perfectly good session, and "no admin form" for an admin. Worse, it reports the
*right* answer for the wrong reason on the negative cases, which is how a
verification script passes while proving nothing. Wait on a condition
(`.waitFor()`), and on the negative cases wait for the page's own content first.

**A refactor with full coverage can leave nothing pinning the new behaviour.**
When the form error region moved from inserted-on-error to always-resident,
every one of the 128 tests still passed against *both* shapes — `findByRole`
retries until the element appears, so it cannot tell them apart. Two tests were
added specifically to fail on the old shape. When you change a pattern, revert
your change and confirm something goes red; if nothing does, the change is
undefended.

**Playwright runs on 5174, and must.** The dev stack's `assets` container
publishes an *unmocked* Vite on 5173, and `reuseExistingServer` cannot tell it
apart from the harness's own `--mode mock` server: with the stack up, Playwright
silently adopts it and the whole suite runs against the real API and the real
database. It fails on a seeded row count, which reads as a broken assertion
rather than "you are testing the wrong server". Do not move the harness back
onto 5173 to "match dev".

**MSW's handlers run in the PAGE, not in the service worker.** So their module
state dies on every reload — which meant a mocked login did not survive a
refresh, while a real Sanctum cookie does. The session is kept in
`sessionStorage` now to close that gap. Any new mock state that should outlive a
reload needs the same treatment; anything that should not, must not get it.

**Never copy a prop into form state with a `useEffect`.** `EventForm` did, and
React committed and painted the render that switched the form to edit mode a
frame before the effect filled the inputs — an empty form flash on every
"Modifier". Seed the state during render and let a `key` on the caller reset it.
jsdom cannot catch this class of bug at all: Testing Library wraps every
interaction in `act()`, which flushes effects before any assertion runs, so the
window does not exist there. `web/e2e/planning.spec.ts` samples animation frames
for it instead.

**Name any list a page renders.** The layout's nav is a list too, so an unscoped
`getByRole("listitem")` counts nav items — four events came back as seventeen
rows. And `getByText` cannot match text split across a `<strong>` label; assert
on `textContent`, remembering JSX keeps the space after `</strong>`.

## Decisions taken in conversation, not visible in the code

- **WordPress is abandoned.** A greenfield rebuild was designed and half-built
  between 2026-07-28 and 2026-08-28, then dropped: *"the effort to migrate
  completely to wordpress is too high! I don't want to learn wordpress, I'm a
  developer."* The branch, its remote and its Docker volumes are deleted. Any
  WordPress design document still reachable in history — including one claiming
  to supersede every other design — is void.
- **The backend question was reopened and closed: Laravel stays.** It is built,
  tested, owns the schema, does Sanctum cookie auth, generates the client, and
  already runs on this shared FTP host.
- **Hard cutover over building alongside.** `app/` was deleted up front rather
  than kept as a running parity reference. The consequence is that the parity
  reference is now `git show dcd7862^:app/pages/<page>.php` and the live site.
- **Icons are `lucide-react`** — same set as the old site, as components. There
  is no central icon registry; the old `assets/js/icons.js` existed only because
  the vanilla library needed one.
- **Guards refuse in place rather than redirect** when a logged-in member lacks
  the capability. Bouncing someone already past the login form reads as "your
  session expired" and invites them to log in again at something they will never
  be allowed to see.

## Starting the stack

```bash
npm run dev        # the whole stack; serves the BUILT artifact on :8090
npm run dev:web    # Vite on :5173, proxying /api to the real API
npm run dev:mock   # Vite on :5173 with MSW — no Docker needed at all
npm run build      # refresh what :8090 serves
npm run smoke      # 13 HTTP checks against the built artifact
npm run put-overlay:test   # upload the SERVER-OWNED .htaccess/robots.txt;
                           # backs up what it replaces, uploads nothing else,
                           # deletes nothing. Add -- --dry-run to rehearse.
```

Note that :8090 serves whatever `npm run build` last produced and does **not**
pick up source edits — that is the point, it is the parity check. Day-to-day
frontend work happens on :5173.

Seeded logins, all passwords `demo`: `demo.admin`, `demo.moderator`,
`demo.user`. The MSW mocks accept the same three.
