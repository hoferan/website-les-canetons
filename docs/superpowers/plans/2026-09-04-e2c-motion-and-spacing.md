# E2c — Feedback Motion and One Spacing Scale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ten improvised `mt-*` values with four named spacing tokens, and add feedback motion in exactly four places, all behind `prefers-reduced-motion`.

**Architecture:** Everything new lives in `web/src/styles.css` (four `--spacing-*` tokens, one `--animate-*` token, one reduced-motion block) plus one class edit in the vendored Button. The spacing application is then a mechanical class rename across pages and components, done in five commits so each can be screenshot-reviewed and reverted alone. No new components, no new behaviour, no API change.

**Tech Stack:** Tailwind 4 (CSS-first, `@theme` tokens — no config file), React 19, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-e2c-motion-and-spacing-design.md` (approved).

---

## Read this before executing

- **TDD does not apply to this round, by the spec's own decision.** Motion and
  spacing are invisible to jsdom; the spec's testing section replaces TDD with
  three checks: the built CSS contains what the tokens should generate (E1's
  method), the whole existing suite passes **untouched**, and a human watches
  the motion at 390px with reduced motion off and then on.
- **An unknown Tailwind class is inert, not an error.** A typo'd `mt-realted`
  fails silently as missing margin. That is why Task 1 build-greps the tokens
  before anything uses them, with temporary probe classes (E1a's exact method).
- **Run all JS suites from PowerShell, not Git Bash** (Vitest collects zero
  files from Git Bash on this machine — known trap, documented in CLAUDE.md).
- **Use `npm run build`, never `npm run build:web` alone**, if the Docker stack
  is up: `build:web` empties `dist/build/` and deletes `api-laravel/` out from
  under it.
- **The suite must pass untouched after every task.** If an e2e geometry bound
  trips, the contingency in that task says what to do — do not loosen a bound.
- Numbers that mean green before you start (recorded at `d6d4994`):
  `npx vitest run` = 258 tests / 40 files; `npm run test:e2e` = 31;
  `npm run test:js` = 140; `npm run smoke` = 13/13.

## The mapping rule (the design decision, locked here)

| token | value | old classes it replaces | relationship |
| --- | --- | --- | --- |
| `tight` | 0.5rem | `mt-1`, `mt-2`, `space-y-1`, `space-y-2` | a label to the thing it labels |
| `related` | 1rem | `mt-3`, `mt-4`, `mt-5`, `space-y-3`, `space-y-4` | items within one block |
| `block` | 2rem | `mt-6`, `mt-8`, `mt-10`, `space-y-6`, `space-y-10` | between blocks inside a section |
| `section` | 4rem | `mt-12`, plus two upgrades named below | between major sections of a page |

Three occurrences are **upgraded past their numeric default** because they mark
major page sections: `Canetons.tsx:111` (`mt-12` on the `<hr>` before the
parrain/marraine block → `mt-section`, which IS its numeric default),
`InscriptionsAdmin.tsx:157` (`mt-10` on the second table's `h2` →
`mt-section`), `Moniteurs.tsx:35` (`mt-8` on the group `h2` → `mt-section`).

Four occurrences **stay as they are**, each with a recorded reason:

- `Layout.tsx:173` footer `mt-16` — the spec says it stays (decided in E1).
- `Logo.tsx:72` `mt-1.5` — lockup micro-typography, not page rhythm.
- `Canetons.tsx:84` `scroll-mt-6` — a scroll offset, not vertical rhythm.
- Everything in `web/src/components/ui/` — vendored; the spec says not ours to
  restyle (`table.tsx`'s `mt-4` included).

---

### Task 1: Branch, spacing tokens, and the build-grep proof

**Files:**
- Modify: `web/src/styles.css` (the `@theme` block, after `--spacing-touch`)

- [ ] **Step 1: Branch from up-to-date main**

```powershell
git checkout main; git pull --ff-only; git checkout -b feat/e2c-motion-and-spacing
```

- [ ] **Step 2: Add the four tokens**

In `web/src/styles.css`, directly below the `--spacing-touch` declaration and
its comment, add:

```css
  /* The vertical scale (E2c). Four steps, named for RELATIONSHIPS rather than
     sizes, because "is this a label or a section?" has an answer where "mt-3
     or mt-4?" does not:
       tight    0.5rem  a label to the thing it labels
       related  1rem    items within one block
       block    2rem    between blocks inside a section
       section  4rem    between major sections of a page
     Pages use these instead of choosing a number. A CONVENTION, not a lint
     rule: the vendored ui/ components keep their own spacing, and the
     recorded one-offs stay (the footer's mt-16 from E1, Logo's lockup
     mt-1.5, scroll-mt-*). See the E2c spec for why exactly four. */
  --spacing-tight: 0.5rem;
  --spacing-related: 1rem;
  --spacing-block: 2rem;
  --spacing-section: 4rem;
```

- [ ] **Step 3: Prove Tailwind generates the utilities (probe method, from E1a)**

Nothing uses the tokens yet and Tailwind only emits classes it finds in
source, so add a temporary probe to `web/src/pages/Accueil.tsx`'s outermost
element's className: `mt-tight mt-related mt-block mt-section space-y-related`.
Then (stack down, or accept the rebuild):

```powershell
npm run build
Select-String -Path dist/build/assets/*.css -Pattern 'mt-tight|mt-related|mt-block|mt-section|space-y-related' | % Matches | % Value | Sort-Object -Unique
```

Expected: all five appear. **If any is absent, the token is not feeding the
spacing utilities** — stop and fix (fallback: explicit `@utility mt-tight
{ margin-top: 0.5rem; }` etc.), re-verify before continuing.

- [ ] **Step 4: Remove the probe classes, rebuild nothing, run the suite**

```powershell
npx vitest run
```

Expected: 258 passed, 40 files. (`git diff web/src/pages` must be empty.)

- [ ] **Step 5: Commit**

```powershell
git add web/src/styles.css
git commit -m "feat(web): four named spacing tokens — tight/related/block/section (E2c)"
```

---

### Task 2: The reduced-motion block

**Files:**
- Modify: `web/src/styles.css` (end of file, after the `focus-ring` utility)

- [ ] **Step 1: Add the block**

```css
/* E2c: every duration to near-zero under reduced motion. This covers the
   Button press transition, the two reveal animations, and sonner's own toast
   animation, in one place — a per-site motion-reduce: variant would be a
   convention that lasts until the next transition is written. 0.01ms rather
   than 0 so transitionend/animationend still fire for anything listening.
   Not optional politeness: the band's audience includes children and the
   members' area is used one-handed outdoors. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Verify it survives the build**

```powershell
npm run build
Select-String -Path dist/build/assets/*.css -Pattern 'prefers-reduced-motion' | Select-Object -First 1
```

Expected: one match.

- [ ] **Step 3: Suite, then commit**

```powershell
npx vitest run
git add web/src/styles.css
git commit -m "feat(web): zero all motion under prefers-reduced-motion (E2c)"
```

---

### Task 3: Button press state

**Files:**
- Modify: `web/src/components/ui/button.tsx:33` (the cva base string) and its doc comment

- [ ] **Step 1: Add the press state to the base variant**

In the `cva` base string, after `transition-all`, add `active:scale-[0.98]`.
The existing `transition-all` (default 150ms) animates it; the Task 2 block
zeroes it under reduced motion. `ButtonLink` composes `buttonVariants`, so
links styled as buttons inherit it.

- [ ] **Step 2: Record it as the fourth deliberate local change**

Extend the file's comment: change "Three deliberate local changes:" to "Four
deliberate local changes:" and append:

```
 * 4. `active:scale-[0.98]` on the base variant — E2c's press feedback. The
 *    existing `transition-all` animates it and the global reduced-motion
 *    block in styles.css zeroes it; do not add a duration here.
```

- [ ] **Step 3: Suite, then commit**

```powershell
npx vitest run
git add web/src/components/ui/button.tsx
git commit -m "feat(web): button press feedback — active scale on the base variant (E2c)"
```

---

### Task 4: The reveal animation — phone nav and the past-events disclosure

**Files:**
- Modify: `web/src/styles.css` (inside `@theme`), `web/src/components/Layout.tsx:103`, `web/src/pages/PlanningRepet.tsx:180`

- [ ] **Step 1: Define the animation token**

In the `@theme` block of `web/src/styles.css`, after the spacing tokens:

```css
  /* E2c's reveal: a 150ms fade-and-settle that REPLAYS each time the element
     re-enters the rendering tree, because display:none -> visible restarts a
     CSS animation. That is the whole mechanism: the phone nav (hidden/block
     class) and the past-events disclosure (the hidden attribute) both toggle
     display, so `animate-reveal` on them animates every OPEN with no JS and
     no DOM change. Closing snaps DELIBERATELY: the acknowledgement matters on
     reveal, animating collapse needs measured heights (or interpolate-size,
     which Firefox lacks), and jsdom/Playwright stay untouched either way. */
  --animate-reveal: reveal 150ms ease-out;

  @keyframes reveal {
    from {
      opacity: 0;
      translate: 0 -0.25rem;
    }
  }
```

- [ ] **Step 2: Apply to the phone nav panel**

`web/src/components/Layout.tsx:103` — the `<ul id="nav-menu">` className
starts with `` `${open ? "block" : "hidden"} border-t ...` ``. Add
`animate-reveal` immediately after that ternary:

```tsx
className={`${open ? "block" : "hidden"} animate-reveal border-t border-white/10 bg-stage text-sm md:mx-auto md:flex md:max-w-shell md:flex-wrap md:items-center md:gap-5 md:border-0 md:bg-panel md:px-4 md:py-2`}
```

(Above `md` the list is always visible, so the animation runs once at mount
and never replays — no desktop flicker on navigation, because the Layout
route survives navigation and the `ul` never leaves the tree there.)

- [ ] **Step 3: Apply to the disclosure**

`web/src/pages/PlanningRepet.tsx:180`:

```tsx
<div id="past-events" hidden={!showingPast} className="animate-reveal">
```

- [ ] **Step 4: Verify the utility generated, suite, commit**

```powershell
npm run build
Select-String -Path dist/build/assets/*.css -Pattern 'animate-reveal' | Select-Object -First 1
npx vitest run
npm run test:e2e
```

Expected: match found; 258 unit, 31 e2e. (Playwright auto-waits through a
150ms animation; `Layout.test.tsx`'s aria-expanded assertions and
`PlanningRepet.test.tsx`'s hidden-until-asked test are class-blind.)

```powershell
git add web/src/styles.css web/src/components/Layout.tsx web/src/pages/PlanningRepet.tsx
git commit -m "feat(web): reveal animation on the phone nav and the past-events disclosure (E2c)"
```

---

### Task 5: Spacing — shared components

**Files:** `web/src/components/` — exact old→new class per line:

| file:line | old | new |
| --- | --- | --- |
| `EventCard.tsx:54` | `mt-1` | `mt-tight` |
| `EventCard.tsx:56` | `mt-3` | `mt-related` |
| `EventCard.tsx:59` | `mt-4` | `mt-related` |
| `FormField.tsx:22` | `mt-4` | `mt-related` |
| `NextEvent.tsx:43` | `mt-8` | `mt-block` |
| `NextEvent.tsx:56` | `mt-3` | `mt-related` |
| `DestinationCards.tsx:77` | `mt-8` | `mt-block` |
| `DestinationCards.tsx:82` | `mt-3` | `mt-related` |
| `DestinationCards.tsx:88` | `mt-1` | `mt-tight` |
| `RegisterIndex.tsx:20` | `mt-6` | `mt-block` |
| `PhotoPending.tsx:28` | `mt-4` | `mt-related` |
| `StatTile.tsx:37` | `mt-1` | `mt-tight` |
| `SouperCta.tsx:55` | `mt-1` | `mt-tight` |
| `SouperCta.tsx:56` | `mt-1` | `mt-tight` |

NOT touched: `Layout.tsx:173` (`mt-16`, spec), `Logo.tsx:72` (`mt-1.5`,
lockup), anything in `ui/`.

- [ ] **Step 1: Apply the table** (edit only the named class in each string; the rest of each className stays byte-identical)
- [ ] **Step 2: Suite + e2e**

```powershell
npx vitest run
npm run test:e2e
```

Expected: 258 and 31. The souper banner bound is ≤300px at a measured 226 —
`SouperCta`'s two 4px→8px steps fit. **Contingency:** if `accueil.spec.ts`'s
banner or hero bound trips, revert only the offending line to its old class
with a one-line comment naming the measured budget, and note it in the
"stays as-is" list in styles.css's token comment.

- [ ] **Step 3: Commit**

```powershell
git add web/src/components
git commit -m "refactor(web): shared components onto the spacing scale (E2c)"
```

---

### Task 6: Spacing — public pages

**Files:** `web/src/pages/` — exact old→new class per line:

| file:line | old | new |
| --- | --- | --- |
| `Accueil.tsx:108` | `mt-6` | `mt-block` |
| `Accueil.tsx:127` | `mt-4` | `mt-related` |
| `Canetons.tsx:79` | `mt-10 space-y-10` | `mt-block space-y-block` |
| `Canetons.tsx:87` | `mt-2` | `mt-tight` |
| `Canetons.tsx:111` | `mt-12` | `mt-section` |
| `Canetons.tsx:113` | `mt-8` | `mt-block` |
| `Canetons.tsx:119` | `mt-4` | `mt-related` |
| `Canetons.tsx:121` | `mt-2` | `mt-tight` |
| `Commencement.tsx:47` | `mt-4` | `mt-related` |
| `Commencement.tsx:52` | `mt-8` | `mt-block` |
| `Commencement.tsx:57,66,82` | `mt-1` | `mt-tight` |
| `Commencement.tsx:86` | `mt-3` | `mt-related` |
| `ComiteTeamDirection.tsx:49` | `mt-6` | `mt-block` |
| `ComiteTeamDirection.tsx:51,56` | `mt-2` | `mt-tight` |
| `ComiteTeamDirection.tsx:61` | `mt-6` | `mt-block` |
| `ComiteTeamDirection.tsx:68` | `mt-1` | `mt-tight` |
| `Historique.tsx:18` | `mt-6 … space-y-4` | `mt-block … space-y-related` |
| `Moniteurs.tsx:35` | `mt-8` | `mt-section` (major section heading — the upgrade named in the mapping rule) |
| `Moniteurs.tsx:36` | `mt-1` | `mt-tight` |
| `Moniteurs.tsx:40` | `mt-6` | `mt-block` |
| `Moniteurs.tsx:41` | `space-y-1` | `space-y-tight` |
| `NotFound.tsx:15,16` | `mt-4` | `mt-related` |
| `NotFound.tsx:23` | `mt-6` | `mt-block` |

NOT touched: `Canetons.tsx:84` (`scroll-mt-6`).

- [ ] **Step 1: Apply the table**
- [ ] **Step 2: Suite + e2e** — expected 258 and 31. **Contingency:** the hero
  bound in `accueil.spec.ts` is ≤460px on badge-top→sentence-bottom;
  `Accueil.tsx:108`'s 24px→32px adds 8px. If it trips, revert that line to
  `mt-6` with a comment: `{/* mt-6, not mt-block: the hero's measured 460px
  budget (accueil.spec.ts) has no 8px to spare. */}`. Same treatment for
  `canetons.spec.ts`'s jump-target bound (<150px) if `Canetons.tsx:87` moves
  a register heading past it.
- [ ] **Step 3: Commit**

```powershell
git add web/src/pages
git commit -m "refactor(web): public pages onto the spacing scale (E2c)"
```

---

### Task 7: Spacing — hidden pages (Cd, Multimedia, Sponsors)

Hidden ≠ deleted: their components are untouched by the hiding and will come
back on-scale rather than off it. `routes.test.tsx` still renders nothing of
them (they 404), and their own unit tests are class-blind.

| file:line | old | new |
| --- | --- | --- |
| `Cd.tsx:8` | `mt-2` | `mt-tight` |
| `Cd.tsx:10,12,14` | `mt-6` | `mt-block` |
| `Cd.tsx:16` | `mt-3 … space-y-1` | `mt-related … space-y-tight` |
| `Cd.tsx:26` | `mt-4` | `mt-related` |
| `Multimedia.tsx:14` | `mt-6` | `mt-block` |
| `Multimedia.tsx:23` | `mt-4` | `mt-related` |
| `Sponsors.tsx:64` | `mt-6 space-y-6` | `mt-block space-y-block` |
| `Sponsors.tsx:68` | `mt-3 … space-y-1` | `mt-related … space-y-tight` |

- [ ] **Step 1: Apply** — then `npx vitest run` (258) — then commit:

```powershell
git add web/src/pages
git commit -m "refactor(web): hidden pages onto the spacing scale (E2c)"
```

---

### Task 8: Spacing — members' area and forms

| file:line | old | new |
| --- | --- | --- |
| `PlanningRepet.tsx:93` | `mt-6` | `mt-block` |
| `PlanningRepet.tsx:113` | `mt-6 space-y-4` | `mt-block space-y-related` |
| `PlanningRepet.tsx:161` | `mt-1` | `mt-tight` |
| `PlanningRepet.tsx:169` | `mt-8` | `mt-block` |
| `PlanningRepet.tsx:181,183` | `mt-4` | `mt-related` |
| `PlanningRepet.tsx:197` | `mt-4 space-y-4` | `mt-related space-y-related` |
| `Login.tsx:94` | `mt-4 space-y-3` | `mt-related space-y-related` |
| `Login.tsx:156,174` | `mt-4` | `mt-related` |
| `Contact.tsx:73` | `mt-4` | `mt-related` |
| `Contact.tsx:74` | `space-y-3` | `space-y-related` |
| `Confirmation.tsx:17` | `mt-4` | `mt-related` |
| `EventForm.tsx:128` | `mt-8` | `mt-block` |
| `EventForm.tsx:129` | `space-y-4` | `space-y-related` |
| `InscriptionsAdmin.tsx:37` | `mt-4` | `mt-related` |
| `InscriptionsAdmin.tsx:108` | `mt-6` | `mt-block` |
| `InscriptionsAdmin.tsx:115` | `mt-8` | `mt-block` |
| `InscriptionsAdmin.tsx:157` | `mt-10` | `mt-section` (the upgrade named in the mapping rule) |
| `InscriptionsAdmin.tsx:158` | `mt-3` | `mt-related` |
| `InscriptionsUtilisateurs.tsx:72,88` | `mt-4` | `mt-related` |
| `InscriptionsUtilisateurs.tsx:82` | `mt-2` | `mt-tight` |

- [ ] **Step 1: Apply** — then `npx vitest run` + `npm run test:e2e` (258/31) — then commit:

```powershell
git add web/src/pages
git commit -m "refactor(web): members' area and forms onto the spacing scale (E2c)"
```

---

### Task 9: Spacing — the souper pages

| file:line | old | new |
| --- | --- | --- |
| `Signup.tsx:122` | `mt-1` | `mt-tight` |
| `Signup.tsx:123` | `mt-4` | `mt-related` |
| `Signup.tsx:124` | `mt-2` | `mt-tight` |
| `Signup.tsx:130` | `mt-6 space-y-6` | `mt-block space-y-block` |
| `Signup.tsx:142` | `mt-2 space-y-3` | `mt-tight space-y-related` |
| `Signup.tsx:171` | `mt-2` | `mt-tight` |
| `Signup.tsx:173` | `mt-4 space-y-3` | `mt-related space-y-related` |
| `Signup.tsx:180` | `mt-1` | `mt-tight` |
| `Signup.tsx:185` | `mt-5` | `mt-related` |
| `Signup.tsx:194` | `mt-2` | `mt-tight` |
| `SignupThanks.tsx:26` | `mt-4` | `mt-related` |
| `SignupThanks.tsx:28,35` | `mt-6` | `mt-block` |
| `SignupThanks.tsx:31` | `mt-3` | `mt-related` |
| `SignupThanks.tsx:39` | `mt-8` | `mt-block` |
| `SignupsAdmin.tsx:108` | `mt-6` | `mt-block` |
| `SignupsAdmin.tsx:132` | `mt-8` | `mt-block` |
| `GuestMenus.tsx:61` | `space-y-2` | `space-y-tight` |
| `GuestMenus.tsx:103,114` | `mt-3` | `mt-related` |
| `GuestMenus.tsx:108` | `mt-2` | `mt-tight` |

- [ ] **Step 1: Apply** — then `npx vitest run` + `npm run test:e2e` (258/31; `souper.spec.ts` asserts roles and text, not geometry) — then commit:

```powershell
git add web/src/pages
git commit -m "refactor(web): souper pages onto the spacing scale (E2c)"
```

---

### Task 10: Prove no raw scale-class survives, full check

- [ ] **Step 1: The leftovers audit**

```powershell
cd web/src
grep -rnE '\bmt-(1|2|3|4|5|6|8|10|12)\b|\bspace-y-(1|2|3|4|6|10)\b' --include='*.tsx' pages components | grep -v '.test.tsx' | grep -v 'components/ui/'
```

Expected: **exactly one line** — `components/Logo.tsx:72`, because `\bmt-1\b`
matches the `mt-1` inside its recorded one-off `mt-1.5` (a word boundary sits
before the dot). Any other hit is either a missed occurrence (apply the
mapping) or a new recorded one-off (add it to the styles.css token comment).
`mt-16` (footer) and `scroll-mt-6` are outside the pattern deliberately.

- [ ] **Step 2: The full gate**

```powershell
npm run check        # exit 0 (typecheck, Pint, vitest, node:test, eslint, stylelint, prettier, guards)
npm run build        # exit 0
npm run smoke        # 13/13
npm run test:e2e     # 31
```

- [ ] **Step 3: Commit anything the audit fixed**

---

### Task 11: Watch it — the verification the spec says matters

Use the screenshot recipe (memory: `dev:mock` on **:5199**, absolute
playwright import, fresh context per role). Playwright's
`page.emulateMedia({ reducedMotion: "reduce" })` flips the media query.

- [ ] **Step 1: Spacing review — screenshot and READ, do not diff-and-assume**

Screenshot at 390 and 1280: `/` (flag on and off), `/canetons`,
`/commencement`, `/comite_teamdirection`, `/moniteurs`, `/historique`,
`/planning_repet` (anonymous, `demo.user`, `demo.admin`), `/signup`,
`/authentification_inscription`, `/contact`. Read every image. The question
per page: do same-relationship gaps now look the same, and does any block
read as orphaned from its heading? Fix by reclassifying (tight↔related↔block)
— never by inventing a fifth step or a raw `mt-*`.

- [ ] **Step 2: Motion review, reduced motion OFF, at 390** — in a headed browser or a screen recording:
  - open/close the phone menu — the panel fades-and-settles in (~150ms), snaps shut;
  - on `/planning_repet`, "Voir les événements passés" — the archive reveals rather than jumping in;
  - press any button — the 0.98 scale is perceptible but not bouncy;
  - as `demo.user`, answer an event — the sonner toast **slides in on its own**
    (this is the spec's "verify, do not re-implement" check).

- [ ] **Step 3: Motion review, reduced motion ON** — same four interactions with
  `reducedMotion: "reduce"`: everything appears instantly, nothing animates.
  A transition that ignores this passes every assertion in the suite — this
  step is the only enforcement.

- [ ] **Step 4: Commit any reclassification with its reason in the message**

---

### Task 12: Documents and PR

- [ ] **Step 1: Update the spec status** — `docs/superpowers/specs/2026-09-01-e2c-motion-and-spacing-design.md`: `**Status:** approved, not yet planned` → `**Status:** implemented — see docs/superpowers/plans/2026-09-04-e2c-motion-and-spacing.md`.
- [ ] **Step 2: Update `docs/continue-here.md`** — E2c row done; "What happens next" no longer names E2c; record the new suite numbers if any test was added (none should be); note the four one-off spacing sites.
- [ ] **Step 3: Commit docs, push, open the PR**

```powershell
git add docs
git commit -m "docs: record E2c as implemented"
git push -u origin feat/e2c-motion-and-spacing
gh pr create --title "feat(web): E2c - feedback motion and one spacing scale" --body-file .github/PULL_REQUEST_TEMPLATE.md
```

Fill every template section. **Open the PR and report CI — do not merge** (a
merge to main auto-deploys TEST; merging is the user's call).

---

## Self-review notes (kept for the executor)

- Spec coverage: tokens (§1) → Task 1; convention-not-lint → token comment,
  Task 10 audit is a *migration completeness* check, not a lint rule; four
  motion sites (§2) → Tasks 3, 4 (nav + disclosure), 11 Step 2 (toast is
  verify-only); reduced motion → Task 2, enforced by Task 11 Step 3;
  rejections (§3) → nothing in this plan animates entrance, scroll, or route
  changes; testing table → Tasks 1/2/4 (built CSS), every task (suite
  untouched), Task 11 (watching); risk mitigation → five separate spacing
  commits, suite green after each.
- The reveal animates *appearance*, not height interpolation — the styles.css
  comment records why (measured heights or interpolate-size, which Firefox
  lacks; close snapping is deliberate). This is the one place the plan
  interprets the spec ("the height change, which currently jumps") rather
  than implementing it literally; the alternative needs DOM restructuring
  that would break "no existing test changes".
- Line numbers were read at `d6d4994`; tasks touch disjoint files, so they
  stay valid per file. Match on the quoted class strings, not blind line
  offsets.
