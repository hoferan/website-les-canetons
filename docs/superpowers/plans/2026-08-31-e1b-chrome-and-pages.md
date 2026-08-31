# E1b — the chrome, the pages and the phone pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the E1a foundation to work: fix the phone-only overlap defect, bring every interactive control to a 44px floor, align the gutters, rebuild `/sinscrire` as tappable cards that answer in one tap, and replace `window.confirm`/`window.alert` with a real dialog and a toast.

**Architecture:** Task 1 is a purely mechanical swap of 35 page shells onto `PageSection`, and it ends with **the entire suite passing untouched** — that is the checkpoint proving the refactor has not overreached before any behaviour changes. Tasks 2–6 restyle the chrome and route controls through the vendored primitives, still without behaviour change. Tasks 7–12 are the deliberate behaviour changes, each with its test changes stated up front.

**Tech Stack:** React 19, React Router 7, Vite 8, Tailwind 4 (CSS-first), shadcn/ui (vendored in E1a), TanStack Query, MSW, Vitest + Playwright.

**Prerequisite:** `docs/superpowers/plans/2026-08-31-e1a-api-filter-and-foundation.md` complete on this branch. `PageSection`, `StatTile`, `EventCard`, the vendored six and the `@/*` alias must all exist.

**Spec:** `docs/superpowers/specs/2026-08-31-e1-mobile-and-component-library-design.md` — sections 4, 5, 6 (the page-facing half) and 7.

---

## The acceptance criterion, restated

The suite has **zero pre-existing class assertions**. So:

> **Every pre-existing test passes untouched, except the ones this plan names in the task that changes them. If any other test needs changing, the refactor overreached.**

The tests this plan changes, and nothing else:

| File | Task |
| --- | --- |
| `web/src/pages/PlanningRepet.test.tsx` | 7 |
| `web/src/pages/EventForm.test.tsx` (the four `window.confirm` stubs) | 8 |
| `web/src/pages/Sinscrire.test.tsx` | 10 |
| `web/src/pages/InscriptionsUtilisateurs.test.tsx` | 11 |
| `web/src/pages/InscriptionsAdmin.test.tsx` | 12 |
| `web/e2e/members.spec.ts` | 13 |

`web/e2e/planning.spec.ts` samples animation frames around the submit button and selects `#event-title` by id. **It must keep passing untouched** — that id and that form are not in scope.

**Run the web suite from PowerShell, not Git Bash** — see E1a's note on the Vitest runner error.

---

## Task 1: Swap all 35 page shells onto `PageSection`

Purely mechanical. No visual intent beyond the widths, no behaviour change, and **the suite must be untouched at the end**. This is the checkpoint the whole plan rests on.

**Files:** every file in the table below.

- [ ] **Step 1: Establish the baseline**

```powershell
npm run test:web
```

Record the passing count. It must be identical at Step 5.

- [ ] **Step 2: Swap each shell**

The mapping from the old ad-hoc width to a `PageSection` width. `shell` is the default and matches the chrome, so gutters line up; `text` is a prose column; `form` is a single narrow form.

| File:line | Was | Becomes |
| --- | --- | --- |
| `pages/Accueil.tsx:14` | `max-w-3xl` | `<PageSection width="text">` |
| `pages/Admin.tsx:27` | `max-w-3xl` | `<PageSection width="text">` |
| `pages/Canetons.tsx:47` | `max-w-3xl` | `<PageSection width="text">` |
| `pages/Cd.tsx:3` | `max-w-3xl` | `<PageSection width="text">` |
| `pages/ComiteTeamDirection.tsx:40` | `max-w-5xl` | `<PageSection>` |
| `pages/Commencement.tsx:43` | `max-w-5xl` | `<PageSection>` |
| `pages/Confirmation.tsx:11` | `max-w-3xl` | `<PageSection width="text">` |
| `pages/Contact.tsx:63` | `max-w-2xl` | `<PageSection width="text">` |
| `pages/Historique.tsx:13` | `max-w-3xl` | `<PageSection width="text">` |
| `pages/InscriptionsAdmin.tsx:25,35,40,74` | `max-w-4xl` | `<PageSection>` (all four) |
| `pages/InscriptionsUtilisateurs.tsx:57,65,75` | `max-w-md` | `<PageSection width="form">` (all three) |
| `pages/Login.tsx:22` | `max-w-md` | `<PageSection width="form">` |
| `pages/Moniteurs.tsx:28` | `max-w-3xl` | `<PageSection width="text">` |
| `pages/Multimedia.tsx:3` | `max-w-3xl` | `<PageSection width="text">` |
| `pages/NotFound.tsx:12` | `max-w-3xl px-4 py-16 text-center` | `<PageSection width="text" className="py-16 text-center">` |
| `pages/PlanningRepet.tsx:25,30,37` | `max-w-3xl` | `<PageSection width="text">` (all three) |
| `pages/Signup.tsx:117` | `max-w-2xl` | `<PageSection width="text">` |
| `pages/SignupsAdmin.tsx:30,35,57,72` | `max-w-5xl` | `<PageSection>` (all four) |
| `pages/SignupThanks.tsx:22` | `max-w-2xl px-4 py-8 text-center` | `<PageSection width="text" className="text-center">` |
| `pages/Sinscrire.tsx:25,30,37` | `max-w-3xl` | `<PageSection width="text">` (all three) |
| `pages/Sponsors.tsx:55` | `max-w-3xl` | `<PageSection width="text">` |

`Cd.tsx`, `Multimedia.tsx` and `Sponsors.tsx` are the three hidden pages — their routes and nav entries are commented out. **Convert them anyway.** They render for nobody so the risk is zero, and leaving three pages on the old shell means whoever un-hides them ships a misaligned page.

For the loading and error states that are a bare `<p>` rather than a `<section>`, wrap rather than replace, so the page keeps its width and the layout does not jump. For example in `pages/Sinscrire.tsx`:

```tsx
  if (events.isPending) {
    return (
      <PageSection width="text">
        <p>Chargement…</p>
      </PageSection>
    );
  }

  if (events.isError) {
    return (
      <PageSection width="text">
        <p role="alert">Le planning n’a pas pu être chargé. Veuillez réessayer.</p>
      </PageSection>
    );
  }
```

Add the import to each file:

```tsx
import { PageSection } from "@/components/PageSection";
```

- [ ] **Step 3: Prove no shell was missed**

```bash
grep -rn "mx-auto max-w-" --include=*.tsx web/src/pages
```

Expected: **no matches.** (`web/src/components/Layout.tsx` still has two; those are Task 2's.)

- [ ] **Step 4: Prove no page kept a stray width**

```bash
grep -rn "max-w-2xl\|max-w-3xl\|max-w-4xl\|max-w-5xl" --include=*.tsx web/src/pages
```

Expected: no matches.

- [ ] **Step 5: The checkpoint**

```powershell
npm run test:web
```

Expected: **exactly the same passing count as Step 1, with no test file edited.**

**If any test fails, do not edit the test.** A failure here means the swap changed markup a test depends on — most likely a `<section>` became nested, or a `role="alert"` moved. Fix the swap.

```bash
git diff --stat -- "web/src/**/*.test.tsx"
```

Expected: no output. If there is any, revert it.

- [ ] **Step 6: Look at it**

```bash
npm run build:web
```

Then screenshot at 1280 and 390 per `docs/continue-here.md`'s recipe (see also the note in E1a). The one thing to check: **the nav's left edge and the page content's left edge now agree.** Before this they were 130px apart at 1280.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages
git commit -m "refactor(web): route every page shell through PageSection

Thirty-five hand-written shells using five different widths become three named
ones. The chrome was fixed at max-w-5xl while most pages were max-w-3xl, so at
1280 the nav's first item started at x=143 and the content at x=272 -- visibly
misaligned on every page of the site.

Mechanical: no test was edited and the suite passes untouched. That is the
checkpoint for the rest of E1b -- the refactor is proved safe before any
behaviour changes."
```

---

## Task 2: The chrome — header, phone nav, desktop nav, footer

**Files:**
- Modify: `web/src/components/Layout.tsx`

Do not touch: the `NAV` array's contents or order (copied from the deleted `navigation.php` because it is the order the band is used to), `ACTIVE_ALIASES`, the `aria-expanded` / `aria-controls` wiring, `aria-current="page"`, the `<p>`-not-`<h1>` decision, or `EnvRibbon`.

- [ ] **Step 1: Header — cost less of a phone screen**

The header plus nav costs 156px of an 844px phone before any content, and the band name wraps to two lines. Replace the header's inner div:

```tsx
        <div className="mx-auto flex max-w-shell items-center gap-3 px-4 py-3">
          <img
            src="/assets/img/Les_Canetons_Fribourg_logo_2.jpg"
            alt="Logo"
            className="h-12 w-auto rounded sm:h-16"
          />
          {/* A <p>, not an <h1>. The page's own title is the document's single
              h1; a site name repeated in the header of every page is branding,
              not the heading of the content below it. Two h1s per page is what
              this was before, on all sixteen routes. */}
          <p className="font-display text-lg leading-tight sm:text-2xl sm:leading-none">
            Les <span className="text-pink">Canetons</span> de Fribourg
          </p>
        </div>
```

- [ ] **Step 2: Phone nav — label the trigger and give it a real target**

Replace the `<button>` with:

```tsx
          <button
            type="button"
            aria-label="Menu de navigation"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="focus-ring flex min-h-touch items-center gap-2 px-4 font-semibold text-ink md:hidden"
          >
            <Menu className="h-6 w-6" />
            Menu
          </button>
```

`aria-label` stays as well as the visible text: the label is what `Layout.test.tsx` and the e2e specs query by, and it must keep matching.

- [ ] **Step 3: Phone nav — rows that can be tapped, on a surface that reads as a menu**

Replace the `<ul>`'s className with:

```tsx
            className={`${open ? "block" : "hidden"} border-t border-white/10 bg-stage text-sm md:mx-auto md:flex md:max-w-shell md:flex-wrap md:items-center md:gap-5 md:border-0 md:bg-panel md:px-4 md:py-2`}
```

The open panel is the stage colour and full-bleed, so it reads as a menu rather than as page content that has been pushed down. Above `md` it is the light nav bar it always was.

- [ ] **Step 4: Phone nav — the items themselves**

Every `<li>` gets a divider, and every link becomes a 48px row on phone while staying inline above `md`. Extract the repeated class string so the ten items, the Flickr link and the auth item cannot drift apart:

```tsx
/**
 * One nav row. On a phone this is a 48px full-width row on the dark stage
 * surface, with a divider; above `md` it collapses back to an inline item on
 * the light bar.
 *
 * Extracted because there are TWELVE call sites — ten links, the Flickr anchor
 * and the auth item — and the phone nav's targets were about 24px before this,
 * roughly half the 44px minimum. A rule applied by hand twelve times is a rule
 * that lasts until the next item is added.
 */
const NAV_ROW =
  "focus-ring flex min-h-12 items-center px-4 md:min-h-0 md:px-0 md:py-1";

const NAV_ROW_ACTIVE = "font-semibold text-pink md:border-b-2 md:border-violet md:text-violet";
const NAV_ROW_IDLE = "text-white/80 hover:text-white md:text-ink-muted md:hover:text-ink";
```

The active item is **pink on the dark phone panel** and violet on the light desktop bar — violet on `--color-stage` does not carry enough contrast, and pink is exactly the "emphasis, never a whole surface" role the palette reserves.

Then each `<li>` becomes:

```tsx
              <li key={item.to} className="border-b border-white/10 last:border-0 md:border-0">
                {/*
                  Link, not NavLink: NavLink's own aria-current is gated by its
                  internal isActive, which matches `to` literally against the
                  URL and has no idea about ACTIVE_ALIASES below. Link leaves
                  aria-current and className to us, so the alias page and the
                  real page agree.
                */}
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  aria-current={active === item.to ? "page" : undefined}
                  className={`${NAV_ROW} ${active === item.to ? NAV_ROW_ACTIVE : NAV_ROW_IDLE}`}
                >
                  {item.label}
                </Link>
              </li>
```

Apply the same `<li>` className and the same `NAV_ROW`/`NAV_ROW_IDLE` to the Flickr `<a>` and the auth `<NavLink>`. Leave the commented-out `/multimedia` block commented, but update its classes to match so un-commenting it does not ship an odd-looking row.

- [ ] **Step 5: Desktop nav — one row again**

The nav was `max-w-5xl` while the header is now `max-w-shell` (72rem), which is what lets all ten entries sit on one row at 1280 instead of wrapping and leaving the auth item alone on a second row. Step 3 already applied `md:max-w-shell`. Push the auth item right:

```tsx
            <li className="nav-auth border-b border-white/10 last:border-0 md:ml-auto md:border-0">
```

- [ ] **Step 6: Footer**

```tsx
      <footer className="mt-16 bg-stage py-8 text-center text-sm text-white/70">
        <p className="mx-auto max-w-shell px-4">
```

- [ ] **Step 7: Test and look**

```powershell
npm run test:web
```

Expected: all PASS **untouched**. `Layout.test.tsx` asserts on roles, French text and `aria-current`; none of that moved.

```bash
npm run build:web
```

Screenshot at 390 with the menu both closed and open, and at 1280. Check: the desktop nav is one row; the phone menu rows are tappable and sit on the dark surface; the active item is legible in both.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/Layout.tsx
git commit -m "feat(web): make the chrome usable on a phone

The phone nav was an unlabelled hamburger revealing ten ~24px text links with no
boundary against the page below -- every target about half the 44px minimum. It
is now a labelled trigger and 48px rows on the dark stage surface, so it reads
as a menu rather than as content pushed down.

The active row is pink on the phone panel and violet on the desktop bar: violet
on --color-stage does not carry enough contrast, and pink is exactly the
emphasis-never-a-surface role the palette reserves for it.

The nav moves to max-w-shell, which both aligns its gutter with the pages and
fits all ten entries on one row at 1280 instead of stranding the auth item on a
second row. Header costs less of a phone screen.

aria-expanded, aria-controls, aria-current, ACTIVE_ALIASES and the NAV order are
all untouched, and no test changed."
```

---

## Task 3: Route the buttons through `Button` and `ButtonLink`

Sixteen sites — eight primary (`bg-violet px-…`) and eight secondary (`hover:border-violet`) — plus four Links styled as buttons. No behaviour change.

**Files:**
- Create: `web/src/components/ButtonLink.tsx`
- Test: `web/src/components/ButtonLink.test.tsx`
- Modify: `web/src/pages/Sinscrire.tsx`, `Login.tsx`, `Contact.tsx`, `Signup.tsx`, `SignupsAdmin.tsx`, `EventForm.tsx`, `InscriptionsUtilisateurs.tsx`, `web/src/components/SouperCta.tsx`

- [ ] **Step 1: Write the failing `ButtonLink` test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { ButtonLink } from "./ButtonLink";

test("an internal destination renders a router link", () => {
  render(
    <MemoryRouter>
      <ButtonLink to="/sinscrire">S’inscrire</ButtonLink>
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "S’inscrire" });
  expect(link).toHaveAttribute("href", "/sinscrire");
});

// An external link that opens a new tab without rel="noreferrer" hands the
// destination a window.opener it can navigate. The nav's Flickr link already
// gets this right by hand; this makes it structural.
test("an external destination opens a new tab and cannot reach window.opener", () => {
  render(
    <MemoryRouter>
      <ButtonLink to="https://example.org" external>
        Galerie
      </ButtonLink>
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Galerie" });
  expect(link).toHaveAttribute("href", "https://example.org");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
});
```

- [ ] **Step 2: Run it and verify it fails**

```powershell
npx vitest run web/src/components/ButtonLink.test.tsx
```

Expected: FAIL — `Failed to resolve import "./ButtonLink"`.

- [ ] **Step 3: Implement it**

```tsx
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

/**
 * A link that looks like a button.
 *
 * Four places style a Link as a button today — /sinscrire's two actions and
 * SouperCta's call to action — each repeating the primary or secondary class
 * string by hand. Button already carries the variants and the 44px floor, and
 * shadcn's `asChild` (Radix Slot) puts them onto whatever element it wraps, so
 * this is the whole component.
 *
 * `external` exists so an outbound link cannot be added without rel="noreferrer":
 * target="_blank" without it hands the destination a window.opener it can
 * navigate.
 */
export function ButtonLink({
  to,
  children,
  external = false,
  variant = "default",
  className,
}: {
  to: string;
  children: React.ReactNode;
  external?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  return (
    <Button asChild variant={variant} className={className}>
      {external ? (
        <a href={to} target="_blank" rel="noreferrer">
          {children}
        </a>
      ) : (
        <Link to={to}>{children}</Link>
      )}
    </Button>
  );
}
```

- [ ] **Step 4: Run the test**

```powershell
npx vitest run web/src/components/ButtonLink.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Replace the button sites**

Find them:

```bash
grep -rn "bg-violet px-\|hover:border-violet" --include=*.tsx web/src/pages web/src/components
```

For each: a primary button becomes `<Button …>`, a secondary becomes `<Button variant="outline" …>`, a destructive one `<Button variant="destructive" …>`. **Keep every existing attribute** — `type`, `aria-disabled`, `aria-label`, `onClick` and the early-return guards all stay exactly as they are.

The shape of every one of these edits, using `Login.tsx`'s submit as the worked example. Before:

```tsx
        <button
          type="submit"
          aria-disabled={login.isPending}
          className="rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          Se connecter
        </button>
```

After — the class string goes entirely, because `Button` owns the variant, the 44px floor and the `aria-disabled` styling:

```tsx
        <Button type="submit" aria-disabled={login.isPending}>
          Se connecter
        </Button>
```

And a secondary, from `EventForm.tsx`'s cancel. Before:

```tsx
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-line bg-panel px-4 py-2 text-ink hover:border-violet hover:text-violet"
        >
          Annuler
        </button>
```

After:

```tsx
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
```

**Never replace `aria-disabled` with `disabled`.** Every submit in this app uses `aria-disabled` plus an early return, because disabling the focused control blurs it to `<body>`. Task 3 must not quietly "improve" that.

For the four Link-as-button sites, use `ButtonLink`.

- [ ] **Step 6: Prove none was missed**

```bash
grep -rn "bg-violet px-\|hover:border-violet" --include=*.tsx web/src/pages web/src/components
```

Expected: no matches.

- [ ] **Step 7: Test, typecheck, look**

```powershell
npm run test:web
```
```bash
npm run typecheck && npm run build:web
```

Expected: all PASS **untouched**. Screenshot at 390 and confirm every button is now at least 44px tall.

- [ ] **Step 8: Commit**

```bash
git add web/src/components web/src/pages
git commit -m "refactor(web): route sixteen buttons and four links through Button

The primary and secondary class strings were repeated eight times each, and four
Links carried a copy of one. Button owns the variants and the 44px floor;
ButtonLink adds asChild plus rel=noreferrer so an outbound link cannot be added
without it.

aria-disabled is preserved everywhere and nowhere replaced by disabled --
disabling a focused control blurs it to body, which is why every submit here
pairs aria-disabled with an early return. No test changed."
```

---

## Task 4: `FormField` renders shadcn's `Input`

`FormField` keeps ownership of the `aria-invalid` / `aria-describedby` / error-`id` wiring and its native `<label htmlFor>`. Only the control inside it changes.

**Files:**
- Modify: `web/src/components/FormField.tsx`

- [ ] **Step 1: Swap the control**

In `web/src/components/FormField.tsx`, drop the hand-written `className` from `shared` and let `Input` carry it:

```tsx
  const shared = {
    id,
    required,
    autoComplete,
    value,
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": problem ? errorId : undefined,
  };
```

and render:

```tsx
      {as === "textarea" ? (
        <textarea
          {...shared}
          rows={6}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "focus-ring w-full rounded-md border bg-panel px-3 py-2 text-ink outline-none",
            problem ? "border-danger" : "border-line",
          )}
        />
      ) : (
        <Input {...shared} type={type} onChange={(event) => onChange(event.target.value)} />
      )}
```

with the imports:

```tsx
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
```

The textarea keeps a hand-written class string because shadcn has no `Textarea` in the vendored set and there is exactly one textarea in the app — adding a component for one call site is not earned. Add that as a comment where the existing "Checkboxes are not handled" comment sits, so the asymmetry is explained rather than looking like an oversight.

`Input` already carries `aria-invalid` styling and, as of E1a, `min-h-touch`.

- [ ] **Step 2: Test**

```powershell
npm run test:web
```

Expected: all PASS **untouched**. `FormField.test.tsx` asserts the wiring — `aria-invalid`, `aria-describedby`, the error id — none of which moved.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/FormField.tsx
git commit -m "refactor(web): FormField renders shadcn's Input

FormField stays the only entry point for a text field and keeps the
aria-invalid / aria-describedby / error-id wiring its comment explains. Only the
control changes, and it gains the 44px floor.

The one textarea keeps a hand-written class string: there is no vendored
Textarea and one call site does not earn a component."
```

---

## Task 5: `/inscriptions_admin` — tiles, and the clipped header

**Files:**
- Modify: `web/src/pages/InscriptionsAdmin.tsx`
- Modify: `web/src/pages/InscriptionsAdmin.test.tsx` (only if it asserts tile markup — check first)

- [ ] **Step 1: Grid the tiles 2-up on phone and use `StatTile`**

Four full-width tiles cost 470px of an 844px phone for four numbers. Replace the tile `<ul>` and its `<li>`s:

```tsx
      {/* A NAMED list, not a bare div. The tiles and the table below use the
          same three words — "Participe", "Ne participe pas", "Pas de réponse" —
          because the old page did, and a plain getByText for one of them
          matches four elements. Naming the list is what lets a test say which
          it means, and it is the same thing the planning page does with its
          "Événements" list.

          aria-live as the old page had it: the numbers change when the query
          refetches, and an admin watching the page should hear it.

          grid-cols-2 below sm: four full-width tiles cost 470px of an 844px
          phone for four numbers. */}
      <ul
        aria-label="Résumé de la participation"
        aria-live="polite"
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {tiles.map((item) => (
          <StatTile key={item.label} label={item.label} value={item.value} />
        ))}
      </ul>
```

with `import { StatTile } from "@/components/StatTile";`.

- [ ] **Step 2: Stop the `Participation` header clipping, and mark the headers up properly**

Both tables live in an `overflow-x-auto` container, which clips the last header instead of scrolling to it because the table has no minimum width. Give each `<table>` a `min-w`, and every `<th>` a `scope`:

```tsx
        <table className="w-full min-w-[28rem] text-left" aria-label="Réponses">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="p-3 font-semibold text-ink-muted">
                Nom d’utilisateur
              </th>
              <th scope="col" className="p-3 font-semibold text-ink-muted">
                Instrument
              </th>
              <th scope="col" className="p-3 font-semibold text-ink-muted">
                Participation
              </th>
            </tr>
          </thead>
```

Do the same for the instruments table with `min-w-[20rem]` and `scope="col"` on both its headers.

Leave the deliberately-different wording between the tiles and the table cells alone — it exists so an accessible-name query cannot match a tile and five cells at once, and its comment says so.

- [ ] **Step 3: Test and look**

```powershell
npm run test:web
```

Expected: all PASS. `InscriptionsAdmin.test.tsx` queries by `data-tile` and by the named list, both preserved by `StatTile`.

Screenshot `/inscriptions_admin` at 390 as `demo.admin`. Check: tiles are 2×2, and the `Participation` header is fully readable after a horizontal scroll rather than cut off.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/InscriptionsAdmin.tsx
git commit -m "feat(web): 2-up stat tiles on a phone, and unclip the table header

Four full-width tiles cost 470px of an 844px phone for four numbers. The
responses table clipped its 'Participation' header rather than scrolling to it,
because the table had no minimum width inside its overflow-x-auto container.

Headers gain scope=col. The deliberately different wording between the tiles and
the cells is untouched -- it stops an accessible-name query matching both."
```

---

## Task 6: The two admin tables through shadcn's `Table`

**Files:**
- Modify: `web/src/pages/InscriptionsAdmin.tsx`, `web/src/pages/SignupsAdmin.tsx`

- [ ] **Step 1: Swap the markup**

Replace `<table>/<thead>/<tbody>/<tr>/<th>/<td>` with `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `@/components/ui/table`. Keep every `aria-label`, every `scope="col"`, the `min-w` from Task 5, and the `overflow-x-auto` wrapper.

shadcn's `Table` renders its own scroll container in some versions. **Check the vendored file before adding a second one** — nested scroll containers on a phone are a genuinely unpleasant bug, and the fix is to keep exactly one.

- [ ] **Step 2: Test**

```powershell
npm run test:web
```

Expected: all PASS untouched. Every table assertion in the suite goes through `getByRole("table", { name: … })`, `row` and `cell`, and `Table` renders real table elements.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/InscriptionsAdmin.tsx web/src/pages/SignupsAdmin.tsx
git commit -m "refactor(web): the two admin tables use the vendored Table

Real table elements, so every getByRole('table'|'row'|'cell') assertion in the
suite keeps working untouched. Kept the aria-labels, the scope=col headers, the
min-w that stops the header clipping, and exactly ONE scroll container."
```

---

## Task 7: `/planning_repet` — the overlap fix and the compressed card

**This is the phone-only defect.** At 390px the `Modifier` and `Supprimer` buttons render on top of the event date: the first card reads `dimanche 20 se[Modifier]2(`. Neither suite can see it — both assert on roles and text, and the text is all in the DOM. It is only wrong on screen.

**Files:**
- Modify: `web/src/pages/PlanningRepet.tsx`
- Modify: `web/src/pages/EventActions.tsx`
- Modify: `web/src/pages/PlanningRepet.test.tsx`

- [ ] **Step 1: Update the test to the compressed card, first**

In `web/src/pages/PlanningRepet.test.tsx`, replace the ordering assertion:

```tsx
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining("Titre : Concert d'automne"),
    expect.stringContaining("Titre : Assemblée générale"),
    expect.stringContaining("Titre : Week-end de répétition"),
  ]);
```

with:

```tsx
  // "Titre :" is gone — the line is obviously the title, and on a phone five
  // label-value lines were mostly label. The titles themselves still pin the
  // order, which is what this test is for.
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining("Concert d'automne"),
    expect.stringContaining("Assemblée générale"),
    expect.stringContaining("Week-end de répétition"),
  ]);
```

and replace the times/location assertions:

```tsx
  expect(first).toHaveTextContent("Heure de début : 19:00");
  expect(first).toHaveTextContent("Heure de fin : 22:00");
  expect(first).toHaveTextContent("Lieu : Salle communale");
  expect(first).toHaveTextContent("Tenue : Costume des canetons");
```

with:

```tsx
  // One meta line now: the two "Heure de …" labels and "Lieu :" were three
  // lines of mostly label on a phone. "Tenue :" KEEPS its label — it is the
  // detail members scan for and the one they get wrong.
  expect(first).toHaveTextContent("19:00 – 22:00");
  expect(first).toHaveTextContent("Salle communale");
  expect(first).toHaveTextContent("Tenue : Costume des canetons");
```

The `an event with no attire omits the Tenue line entirely` test stays exactly as it is — that behaviour is preserved.

- [ ] **Step 2: Run and verify it fails**

```powershell
npx vitest run web/src/pages/PlanningRepet.test.tsx
```

Expected: FAIL on `19:00 – 22:00` not being present.

- [ ] **Step 3: Rebuild the list with `EventCard`**

Replace the `<ul>`'s children in `web/src/pages/PlanningRepet.tsx`:

```tsx
      <ul aria-label="Événements" className="mt-6 space-y-4">
        {/* The API orders by date and now returns only upcoming events, so
            there is no client-side re-sort and no client-side filter — a test
            pins the order, so a change in the API's ordering fails there
            instead of being silently papered over here. */}
        {events.data.data.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            actions={
              can("manage_events") ? <EventActions event={toEditableEvent(event)} onEdit={setEditing} /> : undefined
            }
          >
            <p>
              {formatTime(event.startTime)} – {formatTime(event.endTime)}
              <span aria-hidden="true"> · </span>
              {event.location}
            </p>
            {/* Omitted entirely when there is no dress code, as the old page
                did — a rehearsal with no tenue is legitimate, and an empty
                "Tenue :" line reads like missing data. */}
            {event.attire ? (
              <p className="mt-1">
                <strong className="font-semibold">Tenue :</strong> {event.attire}
              </p>
            ) : null}
          </EventCard>
        ))}
      </ul>
```

with `import { EventCard } from "@/components/EventCard";` and dropping the now-unused `formatEventDate` / `formatEventDateRange` imports — `EventCard` owns the date.

- [ ] **Step 4: Take the actions out of `absolute`**

In `web/src/pages/EventActions.tsx`, replace the wrapper:

```tsx
    <div className="absolute top-2 right-2 flex gap-2">
```

with a fragment, because `EventCard`'s `actions` slot is already the flex footer row:

```tsx
    <>
```

and close it with `</>`. Then add to the file's docblock:

```tsx
 * NOT ABSOLUTELY POSITIONED ANY MORE. This was `absolute top-2 right-2`, and at
 * 390px the two buttons rendered ON TOP of the event date — "dimanche 20
 * se[Modifier]2(" — hiding the one thing the card exists to tell you. Desktop at
 * 1280 was fine, which is why it shipped. Neither suite could catch it: both
 * assert on roles and text, and the text was all present in the DOM. It was only
 * wrong on screen.
 *
 * It renders into EventCard's `actions` footer slot now. A footer cannot overlap
 * a heading at any width, which is why the fix is structural rather than a
 * spacing tweak.
```

Step 3 already replaced the `<li className="relative …">` that made the absolute positioning resolve against the card. Confirm nothing reintroduces `relative`:

```bash
grep -rn "relative" web/src/pages/PlanningRepet.tsx web/src/pages/EventActions.tsx web/src/components/EventCard.tsx
```

Expected: no matches. `EventCard` does not set it and nothing should.

- [ ] **Step 5: Make the buttons full-width on a phone**

Both buttons in `EventActions` get `flex-1 sm:flex-none`, so they fill the row on a phone and sit at natural width from `sm`.

- [ ] **Step 6: Test and look**

```powershell
npm run test:web
```

Expected: all PASS. `EventForm.test.tsx` finds the buttons by `aria-label` — unchanged — and `planning.spec.ts` selects `#event-title`, untouched.

```bash
npm run build:web
```

**Screenshot `/planning_repet` at 390 as `demo.admin` and read the first card's date.** It must be fully legible. This is the defect; the test suite cannot confirm it.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/PlanningRepet.tsx web/src/pages/EventActions.tsx web/src/pages/PlanningRepet.test.tsx
git commit -m "fix(web): stop the event controls covering the date on a phone

EventActions was absolute top-2 right-2, so at 390px the Modifier and Supprimer
buttons rendered on top of the event date -- 'dimanche 20 se[Modifier]2(' --
hiding the one thing the card exists to tell you. Desktop was fine, which is why
it shipped, and neither suite could see it: both assert on roles and text, and
the text was all in the DOM.

The fix is structural: the controls render into EventCard's footer slot, and a
footer cannot overlap a heading at any width.

The card also compresses from five label-value lines to three. 'Titre :' goes
because the line is obviously the title; the two time labels and 'Lieu :' merge
into one meta line; 'Tenue :' keeps its label because it is the detail members
scan for and get wrong."
```

---

## Task 8: `EventActions` — a real dialog and a real toast

**Files:**
- Modify: `web/src/pages/EventActions.tsx`
- Modify: `web/src/pages/EventForm.test.tsx`

**The in-flight guard must survive.** The current handler returns early on `destroy.isPending`, and its comment explains why: without it a second click re-prompts over an in-flight delete. A dialog changes the mechanics of that guard, not its necessity, and `EventForm.test.tsx` pins it.

- [ ] **Step 1: Rewrite the delete control as an `AlertDialog`**

Replace the delete `<button>` with:

```tsx
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`Supprimer ${event.title}`}
            aria-disabled={destroy.isPending}
            // The guard has to come BEFORE the dialog opens, or a second click
            // re-prompts over an in-flight delete. aria-disabled deliberately
            // does not block the click — disabling a focused control blurs it to
            // <body> — so this early return is the only thing that does.
            onClick={(clickEvent) => {
              if (destroy.isPending) clickEvent.preventDefault();
            }}
            className="flex-1 sm:flex-none"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Supprimer
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet événement&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              {event.title} sera définitivement supprimé du planning.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => destroy.mutate({ id: event.id })}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

with `const [confirming, setConfirming] = useState(false);` and the imports for the `AlertDialog*` parts, `Button` and `useState`.

The dialog's own confirm button is also labelled `Supprimer`, so the trigger keeps `aria-label={`Supprimer ${event.title}`}` — that is what distinguishes them in a query, and it is the same reason the title was in the label before.

- [ ] **Step 2: Replace the failure `window.alert` with a toast**

```tsx
  const destroy = useEventDestroy({
    mutation: {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() }),
      onError: () => toast.error("La suppression de l’événement a échoué. Veuillez réessayer."),
    },
  });
```

with `import { toast } from "sonner";`. The `Toaster` is already mounted once in `Layout` as of E1a.

- [ ] **Step 3: Update the four `window.confirm` tests**

In `web/src/pages/EventForm.test.tsx`:

`deleting an event removes it from the list` — the stub goes, and a second click confirms in the dialog:

```tsx
test("deleting an event removes it from the list", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Supprimer Concert d'automne" }));
  // The dialog's own confirm button, not the row's trigger — the trigger
  // carries the event title in its accessible name, the dialog's does not.
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Supprimer" }),
  );

  await waitFor(async () => expect(await rows()).toHaveLength(2));
});
```

`declining the delete confirmation leaves the list alone`:

```tsx
test("declining the delete confirmation leaves the list alone", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Supprimer Concert d'automne" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Annuler" }),
  );

  expect(await rows()).toHaveLength(3);
});
```

`a delete in flight marks the button unavailable and refuses a second click` — **the behaviour this pins must survive.** Rewrite it as: after confirming, the trigger is `aria-disabled`, and clicking it again does **not** reopen the dialog:

```tsx
// The trigger is aria-disabled rather than disabled, so it stays focusable AND
// stays clickable — which makes the handler's early return the only thing
// preventing a second delete prompt over an in-flight one. Nothing else in the
// suite exercises that pending state. This replaces a window.confirm call-count
// assertion; the property is the same one.
test("a delete in flight marks the trigger unavailable and refuses to reopen", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.delete("/api/events/:id", async () => {
      await held;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<PlanningRepet />);
  const remove = await screen.findByRole("button", { name: "Supprimer Concert d'automne" });
  await user.click(remove);
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Supprimer" }),
  );

  await waitFor(() => expect(remove).toHaveAttribute("aria-disabled", "true"));

  // Clickable, because aria-disabled does not block the event — the guard does.
  await user.click(remove);
  expect(screen.queryByRole("alertdialog")).toBeNull();

  release();
  await waitFor(() => expect(remove).not.toHaveAttribute("aria-disabled", "true"));
});
```

Add `within` to the `@testing-library/react` import in this file if it is not already there, and remove the now-unused `vi` import **only if** nothing else in the file uses it.

- [ ] **Step 4: Prove the stubs are gone**

```bash
grep -n "window, \"confirm\"\|window.alert" web/src/pages/EventForm.test.tsx web/src/pages/EventActions.tsx
```

Expected: no matches.

- [ ] **Step 5: Test**

```powershell
npm run test:web
```

Expected: all PASS. If the dialog's animation makes `findByRole("alertdialog")` flaky, wait on the dialog's title instead — do not add arbitrary timeouts.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/EventActions.tsx web/src/pages/EventForm.test.tsx
git commit -m "feat(web): a real confirm dialog and a toast for event deletion

window.confirm and window.alert become an AlertDialog and a sonner toast -- a
native confirm is unstyleable, untranslatable in tone, and on a phone it is a
system sheet that looks nothing like the site.

The in-flight guard survives, which is the point: the trigger is aria-disabled
rather than disabled so it stays focusable and clickable, and the handler's early
return is still the only thing stopping a second prompt over an in-flight delete.
The test now asserts the dialog does not reopen instead of counting confirm
calls -- same property, different mechanism."
```

---

## Task 9: `/planning_repet` — the past-events disclosure

E1a made `GET /api/events` return upcoming events only. This is how the archive stays reachable, and how an admin edits or deletes a past event.

**Files:**
- Modify: `web/src/pages/PlanningRepet.tsx`
- Test: `web/src/pages/PlanningRepet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
test("past events are hidden until asked for, then listed newest first", async () => {
  const user = userEvent.setup();
  await renderWithSession(<PlanningRepet />);

  const list = await screen.findByRole("list", { name: "Événements" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.queryByText("Répétition du samedi")).toBeNull();

  await user.click(screen.getByRole("button", { name: /événements passés/i }));

  expect(await screen.findByText("Répétition du samedi")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify it fails**

```powershell
npx vitest run web/src/pages/PlanningRepet.test.tsx
```

Expected: FAIL — no such button.

- [ ] **Step 3: Implement it**

Add to `PlanningRepet`:

```tsx
  // A SECOND query rather than swapping the first one's parameters: the
  // upcoming list must not blank out while the archive loads, and the archive
  // is fetched only if someone asks for it.
  const [showingPast, setShowingPast] = useState(false);
  const history = useEventIndex(
    { include: "past" },
    { query: { enabled: showingPast } },
  );

  // The API returns one ordering — ascending — for both calls, so the endpoint
  // keeps a single rule and the archive is reversed here. Newest first is what
  // you want of a past list and the opposite of what you want of a future one.
  const past = (history.data?.data ?? [])
    .filter((event) => !events.data.data.some((upcoming) => upcoming.id === event.id))
    .reverse();
```

and render below the events list, before the admin form:

```tsx
      <div className="mt-8">
        <Button
          type="button"
          variant="outline"
          aria-expanded={showingPast}
          aria-controls="past-events"
          onClick={() => setShowingPast((wasShowing) => !wasShowing)}
        >
          {showingPast ? "Masquer les événements passés" : "Voir les événements passés"}
        </Button>

        <div id="past-events" hidden={!showingPast}>
          {history.isPending && showingPast ? <p className="mt-4">Chargement…</p> : null}
          {history.isError ? (
            <p role="alert" className="mt-4">
              Les événements passés n’ont pas pu être chargés. Veuillez réessayer.
            </p>
          ) : null}
          {past.length > 0 ? (
            <ul aria-label="Événements passés" className="mt-4 space-y-4">
              {past.map((event) => (
                <EventCard key={event.id} event={event} className="opacity-75">
                  <p>
                    {formatTime(event.startTime)} – {formatTime(event.endTime)}
                    <span aria-hidden="true"> · </span>
                    {event.location}
                  </p>
                </EventCard>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
```

The past list is deliberately **named differently** from `"Événements"`, so a `getAllByRole("listitem")` scoped to either list means one thing. It carries **no** `EventActions`: an admin who needs to correct a past event can, but adding delete buttons to an archive invites the misclick it protects against — if that turns out to be wanted, it is a separate decision.

- [ ] **Step 4: Confirm the query-key invalidation still works**

`EventActions` invalidates `getEventIndexQueryKey()`, which is built without parameters. Verify that this is a **prefix** of the parameterised key, so invalidating it refreshes both lists:

```bash
grep -n "getEventIndexQueryKey" -A 4 web/src/api/generated/endpoints.ts | head -12
```

If the no-argument key is `["/api/events"]` and the parameterised one is `["/api/events", {include:"past"}]`, TanStack's prefix matching covers both and nothing more is needed. **If the shapes are not in a prefix relationship, the archive will go stale after a delete** — then invalidate with the explicit `{ include: "past" }` key as well, and add a test for it.

- [ ] **Step 5: Test and look**

```powershell
npm run test:web
```

Expected: all PASS. Screenshot at 390 with the disclosure open and closed.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/PlanningRepet.tsx web/src/pages/PlanningRepet.test.tsx
git commit -m "feat(web): a past-events disclosure on the planning page

GET /api/events now returns upcoming events only, which put the next rehearsal
at the top where it belongs. This keeps the archive reachable, and is how an
admin gets to a past event.

A second query rather than reparameterising the first, so the upcoming list does
not blank out while the archive loads and the archive is only fetched if asked
for. The API keeps one ascending ordering and the archive is reversed here --
newest first is right for a past list and wrong for a future one.

The past list is named separately from 'Événements' so a listitem query scoped to
either means one thing, and it carries no delete buttons: an archive with
destructive controls invites the misclick they guard against."
```

---

## Task 10: `/sinscrire` — cards, and answering in one tap

The screen whose entire purpose is "do I play Saturday?". Today it is a three-column table squeezed into 390px with every cell wrapping to three lines and a 28px action button, and once you have answered, the UI shows a **dead** `Choix enregistré` — even though `ResponseController::store` upserts and has always allowed a change.

**Files:**
- Modify: `web/src/pages/Sinscrire.tsx`
- Modify: `web/src/pages/Sinscrire.test.tsx`

- [ ] **Step 1: Rewrite the test file to the new behaviour**

The role-matrix tests keep their intent and change their query, because the actions are now buttons on cards rather than links in a table:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Sinscrire } from "./Sinscrire";

const cards = async () =>
  within(await screen.findByRole("list", { name: "Événements à venir" })).getAllByRole("listitem");

test("a member who may respond gets both answers on every event", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("button", { name: "Je participe" })).toHaveLength(3);
  expect(screen.getAllByRole("button", { name: "Je ne participe pas" })).toHaveLength(3);
  expect(screen.queryByRole("link", { name: "Résumé" })).toBeNull();
});

// The matrix is NOT a hierarchy: admin holds view_summary and NOT respond, so
// it gets the other action entirely. Every intuition about roles says an admin
// can do what a user can; here it cannot.
test("an admin gets the summary action instead, not as well", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("link", { name: "Résumé" })).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "Je participe" })).toBeNull();
});

test("a moderator responds, like a user", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("button", { name: "Je participe" })).toHaveLength(3);
});

test("answering an event takes one tap and shows the saved answer", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);

  const first = (await cards())[0]!;
  await user.click(within(first).getByRole("button", { name: "Je participe" }));

  expect(await within(first).findByText("Je participe")).toBeInTheDocument();
  expect(within(first).getByRole("button", { name: "Modifier" })).toBeInTheDocument();
});

// The API has ALWAYS allowed this — ResponseController::store upserts on
// (user_id, event_id) and its own comment says "Answering again overwrites".
// Only the UI forbade it, with a disabled "Choix enregistré" button, which made
// a mistap permanent. One-tap answering is only safe because of this.
test("an answer can be changed", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  const { server } = await import("../mocks/node");
  const { HttpResponse, http } = await import("msw");
  const { SEED } = await import("../mocks/handlers");
  server.use(
    http.get("/api/events", () =>
      // A relative date, like the fixture: a hardcoded one would fall out of
      // the upcoming default on its own date.
      HttpResponse.json([{ ...SEED[1]!, response: "participate" }]),
    ),
  );

  await renderWithSession(<Sinscrire />);
  await user.click(await screen.findByRole("button", { name: "Modifier" }));
  expect(await screen.findByRole("button", { name: "Je ne participe pas" })).toBeInTheDocument();
});

// The API orders by date. The old page re-sorted client-side; dropping that
// means a change in the API's ordering fails HERE rather than being silently
// corrected in the UI.
test("the cards keep the order the API returned", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);
  expect((await cards()).map((card) => card.textContent)).toEqual([
    expect.stringContaining("Concert d'automne"),
    expect.stringContaining("Assemblée générale"),
    expect.stringContaining("Week-end de répétition"),
  ]);
});
```

Note `SEED[1]` is `Concert d'automne` **after E1a Task 6 prepends the past event.** Confirm with `SEED.find((event) => event.title === "Concert d'automne")` if you would rather not depend on the index — that is the safer form and the reason E1a switched `PlanningRepet.test.tsx` to it.

- [ ] **Step 2: Run and verify it fails**

```powershell
npx vitest run web/src/pages/Sinscrire.test.tsx
```

Expected: FAIL — there is no `list` named `Événements à venir` and no `Je participe` button.

- [ ] **Step 3: Rewrite the page**

```tsx
import { useState } from "react";

import { useEventIndex, useResponseStore, getEventIndexQueryKey } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { EventCard } from "@/components/EventCard";
import { FormError } from "../components/FormField";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ButtonLink";
import { formatTime } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
```

The answer control, as its own component in the same file — it owns one card's pending and error state, which a page-level state would smear across every card:

```tsx
/**
 * The two answers, for one event.
 *
 * ONE TAP COMMITS. The old flow was four interactions — tap S'inscrire, land on
 * a second page, open a <select> (an OS wheel picker on a phone), pick, tap
 * Confirmer — for a yes/no question, on a screen someone reads outdoors while
 * deciding whether they play on Saturday.
 *
 * That is only safe because the answer stays CHANGEABLE. The API has always
 * upserted on (user_id, event_id); it was the UI that made a mistap permanent
 * with a disabled "Choix enregistré" button. So a mistap here self-corrects.
 *
 * Its own component, and its own state, because pending and error belong to one
 * card. Hoisted to the page they would grey out every card while one saves.
 */
function AnswerControls({
  eventId,
  answer,
}: {
  eventId: number;
  answer: string | null;
}) {
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const { error, setFromThrown, clear } = useApiFormError(
    "L’inscription a échoué. Veuillez réessayer.",
  );

  const respond = useResponseStore({
    mutation: {
      onSuccess: async () => {
        setChanging(false);
        toast.success("Votre réponse est enregistrée.");
        await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      },
      onError: setFromThrown,
    },
  });

  const send = (participation: "participate" | "notparticipate") => {
    if (respond.isPending) return;
    clear();
    respond.mutate({ data: { eventId, participation } });
  };

  if (answer && !changing) {
    return (
      <>
        <p className="font-semibold text-violet">
          {answer === "participate" ? "Je participe" : "Je ne participe pas"}
        </p>
        <Button type="button" variant="outline" onClick={() => setChanging(true)}>
          Modifier
        </Button>
      </>
    );
  }

  return (
    <>
      {/* w-full so the error takes its own line: this renders into
          EventCard's `actions` row, which is a flex container, and a bare
          FormError would sit beside a button instead of above both. */}
      <div className="w-full">
        <FormError error={error} />
      </div>
      <Button
        type="button"
        aria-disabled={respond.isPending}
        onClick={() => send("participate")}
        className="flex-1 sm:flex-none"
      >
        Je participe
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-disabled={respond.isPending}
        onClick={() => send("notparticipate")}
        className="flex-1 sm:flex-none"
      >
        Je ne participe pas
      </Button>
    </>
  );
}
```

and the list:

```tsx
      <ul aria-label="Événements à venir" className="mt-6 space-y-4">
        {events.data.data.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            actions={
              <>
                {can("respond") ? (
                  <AnswerControls eventId={event.id} answer={event.response} />
                ) : null}
                {can("view_summary") ? (
                  <ButtonLink to={`/inscriptions_admin?id=${event.id}`} variant="outline">
                    Résumé
                  </ButtonLink>
                ) : null}
              </>
            }
          >
            <p>
              {formatTime(event.startTime)} – {formatTime(event.endTime)}
              <span aria-hidden="true"> · </span>
              {event.location}
            </p>
          </EventCard>
        ))}
      </ul>
```

Delete the `<table>` and its wrapper entirely.

- [ ] **Step 4: Test**

```powershell
npm run test:web
```

Expected: all PASS.

- [ ] **Step 5: Look at it, at 390 and 1280**

```bash
npm run build:web
```

Screenshot `/sinscrire` as `demo.user`. Check: cards, both answers at 44px+, and the saved state after a tap. Then as `demo.admin`: `Résumé` only, no answer buttons.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Sinscrire.tsx web/src/pages/Sinscrire.test.tsx
git commit -m "feat(web): answer an event in one tap, and let it be changed

/sinscrire was a three-column table squeezed into 390px -- every cell wrapping
to three lines, its action button 28px tall -- and answering took four
interactions including an OS wheel picker, for a yes/no question, on the one
screen people read outdoors.

It is cards with two buttons now, and one tap commits. That is only safe because
the answer stays changeable: the API has always upserted on (user_id, event_id)
and it was the UI that made a mistap permanent with a disabled 'Choix
enregistre'. A mistap now self-corrects.

Pending and error state live per card rather than per page, so saving one answer
does not grey out the others."
```

---

## Task 11: `/inscriptions_utilisateurs` — the same two buttons

The URL stays: URLs are frozen, and it becomes the deep-link entry point for one event.

**Files:**
- Modify: `web/src/pages/InscriptionsUtilisateurs.tsx`
- Modify: `web/src/pages/InscriptionsUtilisateurs.test.tsx`

- [ ] **Step 1: Update the tests**

Delete `the member's own username is shown and not editable` entirely — the field is gone. Add a note in its place:

```tsx
// The read-only username input this used to assert is GONE. It was an input
// nobody could edit, holding a value the header already shows on every page.
```

Replace `answering returns to the list`:

```tsx
test("answering takes one tap and returns to the list", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=1" });

  await user.click(await screen.findByRole("button", { name: "Je participe" }));

  expect(await screen.findByText("Liste")).toBeInTheDocument();
});
```

In `a missing id says so in French rather than posting`, replace the `Confirmer` assertion:

```tsx
  expect(screen.queryByRole("button", { name: "Je participe" })).toBeNull();
```

- [ ] **Step 2: Run and verify it fails**

```powershell
npx vitest run web/src/pages/InscriptionsUtilisateurs.test.tsx
```

Expected: FAIL — no `Je participe` button.

- [ ] **Step 3: Replace the form**

Drop the `<form>`, the `participation` state, the `<select>`, the read-only username field and the `Confirmer` button. Keep the event lookup, the three "no such event" branches and the `onSuccess: () => navigate("/sinscrire")`.

```tsx
      <FormError error={error} />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          aria-disabled={respond.isPending}
          onClick={() => send("participate")}
          className="flex-1 sm:flex-none"
        >
          Je participe
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-disabled={respond.isPending}
          onClick={() => send("notparticipate")}
          className="flex-1 sm:flex-none"
        >
          Je ne participe pas
        </Button>
      </div>
```

with:

```tsx
  const send = (participation: "participate" | "notparticipate") => {
    if (respond.isPending || !event) return;
    clear();
    respond.mutate({ data: { eventId: event.id, participation } });
  };
```

Add to the page's docblock:

```tsx
 * A DEEP-LINK FALLBACK now, not the main flow. /sinscrire answers inline in one
 * tap, so nothing links here any more — but the URL is frozen and is in
 * bookmarks, so it keeps working and offers the same two buttons.
 *
 * Note a link to a PAST event now falls through to the "Aucun événement à
 * confirmer" branch below, because GET /api/events returns upcoming events by
 * default and this page finds its event in that list. That is correct rather
 * than regrettable: answering an event that has happened is meaningless.
```

- [ ] **Step 4: Test**

```powershell
npm run test:web
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/InscriptionsUtilisateurs.tsx web/src/pages/InscriptionsUtilisateurs.test.tsx
git commit -m "feat(web): two buttons instead of a dropdown and a Confirmer step

The select, the Confirmer button and the read-only username input all go -- the
last was a field nobody could edit holding a value the header already shows.

The URL stays and keeps working: it is frozen and in bookmarks, and it is now
the deep-link entry point for one event rather than the main flow. A link to a
past event falls through to the existing 'Aucun evenement' branch, which is
correct -- answering an event that has happened is meaningless."
```

---

## Task 12: The public pages through `Card`

Mechanical, no behaviour change. The remaining hand-written panel surfaces.

**Files:** `web/src/pages/Canetons.tsx`, `Commencement.tsx`, `ComiteTeamDirection.tsx`, `Moniteurs.tsx`, `Sponsors.tsx`, `web/src/components/SouperCta.tsx`, `web/src/components/PhotoPending.tsx`

- [ ] **Step 1: Swap the surfaces**

```bash
grep -rn "border-line bg-panel" --include=*.tsx web/src
```

Each becomes a `Card` — bare for a simple panel, with `CardHeader`/`CardContent` only where there is genuine structure (`SouperCta`, the `/commencement` fact cards). For a `<li>`, use `<Card asChild>` as `StatTile` does.

A simple panel, from `ComiteTeamDirection.tsx`. Before:

```tsx
      <div className="mt-6 rounded-lg border border-line bg-panel p-5">
        <h2 className="font-display text-xl">Contact des Canetons</h2>
```

After — `gap-0 p-5` overrides the vendored Card's `gap-6 py-6` composition rhythm, exactly as `StatTile` does:

```tsx
      <Card className="mt-6 gap-0 p-5">
        <h2 className="font-display text-xl">Contact des Canetons</h2>
```

A list item, from the same file's committee grid. Before:

```tsx
          <li key={member.role} className="rounded-lg border border-line bg-panel p-4">
```

After:

```tsx
          <Card key={member.role} asChild className="gap-0 p-4">
            <li>
```

— closing with `</li></Card>`, and a `<CardHeader>`-style structure only where a panel genuinely has a header, a body and a footer.

**`PhotoPending` keeps its dashed border and its size.** Its shape is E2's first decision, and changing it here would pre-empt a design question nobody has answered.

- [ ] **Step 2: Prove none was missed**

```bash
grep -rn "border-line bg-panel" --include=*.tsx web/src
```

Expected: only `web/src/components/PhotoPending.tsx`.

- [ ] **Step 3: Test and look**

```powershell
npm run test:web
```
```bash
npm run typecheck && npm run build:web
```

Expected: all PASS untouched. Screenshot the public pages at 390 and 1280.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages web/src/components
git commit -m "refactor(web): the remaining panel surfaces use Card

PhotoPending deliberately keeps its dashed border and its size -- its shape is
E2's first decision and changing it here would pre-empt an unanswered design
question."
```

---

## Task 13: The e2e suite

**Files:**
- Modify: `web/e2e/members.spec.ts`
- Create: `web/e2e/mobile.spec.ts`

- [ ] **Step 1: Update the inline-answer journey**

In `web/e2e/members.spec.ts`, replace `a member answers an event and the list remembers`:

```tsx
test("a member answers an event in one tap and can change it", async ({ page }) => {
  await login(page, "demo.user");
  await page.goto("/sinscrire");

  const first = page.getByRole("list", { name: "Événements à venir" }).getByRole("listitem").first();

  await first.getByRole("button", { name: "Je participe" }).click();
  await expect(first.getByText("Je participe")).toBeVisible();

  // The half the old flow could not do at all: the API always upserted, and
  // only the UI made a mistap permanent.
  await first.getByRole("button", { name: "Modifier" }).click();
  await first.getByRole("button", { name: "Je ne participe pas" }).click();
  await expect(first.getByText("Je ne participe pas")).toBeVisible();
});
```

Replace the admin test's `link` query for `S’inscrire` with the button name:

```tsx
  await expect(page.getByRole("button", { name: "Je participe" })).toHaveCount(0);
```

- [ ] **Step 2: Add a phone spec**

```tsx
import { expect, test } from "@playwright/test";

// 390x844 — the iPhone-class viewport every finding in the E1 spec was measured
// at. The unit suite cannot see any of this: it asserts roles and text, and the
// text was always present in the DOM even when it rendered underneath a button.
test.use({ viewport: { width: 390, height: 844 } });

test("the phone menu opens, and its rows are big enough to tap", async ({ page }) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Menu de navigation" });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const accueil = page.getByRole("link", { name: "Accueil" });
  await expect(accueil).toBeVisible();

  // 44px is the floor; the nav rows are specified at 48.
  const box = (await accueil.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test("the event controls do not cover the date on a phone", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.goto("/planning_repet");

  const first = page.getByRole("list", { name: "Événements" }).getByRole("listitem").first();
  const heading = first.getByRole("heading");
  const remove = first.getByRole("button", { name: /^Supprimer/ });

  const headingBox = (await heading.boundingBox())!;
  const removeBox = (await remove.boundingBox())!;

  // THE REGRESSION TEST FOR THE DEFECT E1 EXISTS FOR. The controls were
  // `absolute top-2 right-2` and rendered on top of the date -- "dimanche 20
  // se[Modifier]2(". Asserting the boxes do not intersect is the only kind of
  // assertion that could have caught it.
  const overlaps =
    removeBox.x < headingBox.x + headingBox.width &&
    removeBox.x + removeBox.width > headingBox.x &&
    removeBox.y < headingBox.y + headingBox.height &&
    removeBox.y + removeBox.height > headingBox.y;
  expect(overlaps).toBe(false);
});
```

- [ ] **Step 3: Run the e2e suite**

```bash
npm run test:e2e
```

Expected: all PASS, including `planning.spec.ts` **untouched**.

- [ ] **Step 4: Commit**

```bash
git add web/e2e
git commit -m "test(e2e): cover the inline answer, and the phone defects

members.spec.ts follows the one-tap flow and then CHANGES the answer -- the half
the old UI could not do at all.

mobile.spec.ts is new and asserts at 390x844: the menu rows clear 44px, and the
event controls' bounding box does not intersect the date's. That last one is the
only kind of assertion that could have caught the defect E1 exists for -- the
text was always in the DOM, it was just underneath a button."
```

---

## Task 14: Look at the whole site, then verify

The suite cannot see layout. Two of E1's findings were invisible to a fully green suite.

- [ ] **Step 1: Build and screenshot every route**

```bash
npm run build:web
```

Screenshot every route at 1280 and 390, anonymous, `demo.user` and `demo.admin`, per the recipe in `docs/continue-here.md`. **Read the images.** Check specifically:

1. `/planning_repet` at 390 as admin — the date of every card is fully legible.
2. `/sinscrire` at 390 — cards, both answers, nothing clipped.
3. The phone menu — open and closed, on the dark surface, active row legible.
4. `/inscriptions_admin` at 390 — tiles 2×2, `Participation` header readable.
5. Every page — the nav's left edge and the content's left edge agree at 1280.
6. No page scrolls horizontally at 390.

- [ ] **Step 2: Full verification**

```bash
npm run check
```
```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```
```bash
npm run test:e2e
npm run build && npm run smoke
```

Expected: all green. `npm run smoke` runs 13 HTTP checks against the built artifact.

- [ ] **Step 3: Confirm the blast radius**

```bash
git diff --stat main -- "web/src/**/*.test.tsx" "web/e2e"
```

Every changed test file must be one this plan named. **If any other appears, something overreached** — go back and find out what.

- [ ] **Step 4: Commit anything outstanding, then stop**

Open a PR. **Do not merge:** a merge to `main` auto-deploys TEST, so a merge here *is* a deploy, and that is André's call.

```bash
gh pr create --title "feat(web): the E1 phone pass, component library and events filter" --body-file .github/PULL_REQUEST_TEMPLATE.md
```

Fill in every section of the template.

---

## Definition of done for E1b

- [ ] `npm run check` green.
- [ ] Laravel suite green in Docker.
- [ ] `npm run test:e2e` green, with `planning.spec.ts` untouched.
- [ ] `npm run build && npm run smoke` green — 13/13.
- [ ] `grep -rn "mx-auto max-w-" --include=*.tsx web/src/pages` — no matches.
- [ ] `grep -rn "bg-violet px-\|hover:border-violet" --include=*.tsx web/src` — no matches.
- [ ] `grep -rn "window.confirm\|window.alert" web/src` — no matches.
- [ ] `grep -rn "border-line bg-panel" --include=*.tsx web/src` — only `PhotoPending.tsx`.
- [ ] Only the six test files this plan names have changed.
- [ ] Screenshots read at 1280 and 390, all six checks in Task 14 Step 1 satisfied.

## Deliberately not done

`PhotoPending`'s shape, `/canetons`'s eight stacked dashed boxes (3062px on a phone), `/accueil` as a front door, new public-page copy, motion, and the ported French inconsistencies (`Nom:` versus `Nom :`, "Liens Amis"). All **E2**.

`/cd`, `/multimedia` and `/sponsors` stay hidden. No `<Tbd>` is filled in — **PROD remains blocked on content**, which is a content gate and not a code one.
