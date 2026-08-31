# Visual Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the SPA a visual design — the *Scène* direction — and apply it to the chrome and the four pages that already exist, so the nine content pages of sub-project A2 land on a system instead of on nothing.

**Architecture:** Tokens and two self-hosted faces go into `web/src/styles.css`'s `@theme` block (Tailwind 4 is CSS-first here — there is no config file). `Layout.tsx` carries the chrome and therefore restyles every route at once. The four ported pages then move onto the tokens. Nothing about markup structure, French copy, routes or the API changes.

**Tech Stack:** Tailwind 4 (CSS-first), React 19 + TypeScript, Vite 8, Fontsource, Vitest + Testing Library, Playwright.

**Design:** `docs/superpowers/specs/2026-08-29-visual-foundation-design.md`

---

## Before you start

Read `docs/continue-here.md`, and read the spec. The things most likely to trip you here:

- **Tailwind 4 has no `tailwind.config.ts` in this project.** Tokens live in the `@theme` block in `web/src/styles.css`. Do not create a config file.
- **`.stylelintrc.json` already lists Tailwind's at-rules** under `at-rule-no-unknown`'s `ignoreAtRules` and disables `import-notation`. Both are deliberate. Do not "fix" either.
- **Tailwind class names are strings**, so renaming a colour token has no compile-time safety net anywhere. A missed rename fails silently as an unstyled element.
- **`npm run check` does not build.** Run `npm run build` separately; it is the only thing that proves the CSS actually compiles.
- **Do not re-order the navigation.** `NAV` in `Layout.tsx` is in the order the band is used to, copied from the deleted `app/partials/navigation.php`. It is neither alphabetical nor the route order, and that is on purpose.
- Baselines to beat: **131 unit tests** across 18 files, **11 e2e tests**, `npm run check` exit 0, 13/13 smoke.

## File structure

| File | Responsibility |
| --- | --- |
| `web/public/assets/img/*` | **modify (binary).** Resized and recompressed in Task 1. |
| `CLAUDE.md` | **modify.** Record the image budget so the next person adding a photo knows the rule. |
| `package.json` | **modify.** Two Fontsource dependencies. |
| `web/src/styles.css` | **modify.** The whole token system: colours, fonts, type scale. |
| `web/src/components/Layout.tsx` | **modify.** Header, nav, footer. |
| `web/src/components/Layout.test.tsx` | **modify.** One assertion, which the spec calls out. |
| `web/src/components/EnvRibbon.tsx` | **modify.** Token rename only. |
| `web/src/components/FormField.tsx` | **modify.** Token rename plus field styling. |
| `web/src/pages/PlanningRepet.tsx`, `EventForm.tsx`, `EventActions.tsx`, `Login.tsx`, `Contact.tsx`, `Confirmation.tsx`, `NotFound.tsx`, `Placeholder.tsx` | **modify.** Onto the tokens. |

---

## Task 1: Make the images loadable

`web/public/assets/img/` is **44.5 MB**. `directionmusicale.jpg` is 6048×4024 at **19 MB**; nine more photos are 1920×1277 at over 2 MB each, which is a *compression* problem rather than a dimension one. On a phone at a rehearsal this is a page that never finishes loading.

This is independent of the design, mechanical, and goes first so the rest of the work is done against realistic assets.

**Files:**
- Modify: `web/public/assets/img/*.jpg` (binary)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Record the current state**

```bash
du -sh web/public/assets/img/
ls -la web/public/assets/img/
```

Write the total down. You will compare against it in Step 4.

- [ ] **Step 2: Resize and recompress**

The rule: **longest edge at most 1920px, JPEG quality 82, progressive, EXIF stripped.** Four files are deliberately skipped because they are already small and resizing them would only degrade them:

| Skipped | Why |
| --- | --- |
| `Les_Canetons_Fribourg_logo_2.jpg` | 237×174, 39 KB — chrome, and re-encoding a small logo visibly softens it |
| `comite.jpg` | 512×340, 55 KB |
| `CD_img.png` | a PNG; may carry transparency, and 344 KB is tolerable |
| `Flyer.jpeg` | 752×1049, 161 KB |

Python with Pillow is available on this machine. Run this from the repo root:

```python
python - <<'PY'
from PIL import Image
import os

D = "web/public/assets/img"
SKIP = {"Les_Canetons_Fribourg_logo_2.jpg", "comite.jpg", "CD_img.png", "Flyer.jpeg"}
MAX_EDGE, QUALITY = 1920, 82

for name in sorted(os.listdir(D)):
    path = os.path.join(D, name)
    if not os.path.isfile(path) or name in SKIP:
        continue
    if not name.lower().endswith((".jpg", ".jpeg")):
        continue
    before = os.path.getsize(path) / 1024
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        longest = max(w, h)
        if longest > MAX_EDGE:
            im = im.resize(
                (round(w * MAX_EDGE / longest), round(h * MAX_EDGE / longest)),
                Image.LANCZOS,
            )
        # No exif= argument: Pillow drops metadata unless asked to keep it, which
        # is what we want. Progressive so a slow connection paints something.
        im.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    after = os.path.getsize(path) / 1024
    print(f"{name:<38}{before:8.0f} -> {after:6.0f} KB")
PY
```

**Do not run this twice.** JPEG re-encoding is lossy and generational: a second pass at quality 82 over an already-82 image loses more detail for almost no size gain. If you need to retry, `git checkout web/public/assets/img/` first.

- [ ] **Step 3: Look at the result**

Not optional, and not replaceable by the byte count. Open at least `canetons.jpg`, `directionmusicale.jpg` and `lyre.jpg` (the portrait one) and check the neon detail in the costumes has survived. If any looks muddy, `git checkout` the directory and retry at quality 88.

- [ ] **Step 4: Verify the totals**

```bash
du -sh web/public/assets/img/
```

Expected, from a dry run: **44.5 MB → about 6.0 MB**, an 87% reduction. Per-file expectations for the largest:

| File | Before | After |
| --- | --- | --- |
| `directionmusicale.jpg` | 19367 KB | ~584 KB |
| `parrainmarraine.jpg` | 4679 KB | ~264 KB |
| `trompettes.jpg` | 2772 KB | ~606 KB |
| `canetons.jpg` | 2216 KB | ~421 KB |

If your numbers differ wildly, stop and report rather than committing.

- [ ] **Step 5: Record the rule**

In `CLAUDE.md`, under the `web/` layout section where `public/assets/img/` is described, add:

```markdown
  **Photographs have a budget: longest edge 1920px, JPEG quality 82,
  progressive, no EXIF — roughly 300-600 KB each.** The directory was 44.5 MB
  before this was enforced, with one 19 MB file, which on a phone at a
  rehearsal is a page that never finishes loading. A camera original dropped in
  unprocessed will not be caught by any test or lint rule, so it has to be
  caught here.
```

- [ ] **Step 6: Verify nothing else moved and commit**

```bash
npm run build && npm run smoke
git add web/public/assets/img CLAUDE.md
git commit -m "perf(web): bring the image directory from 44.5 MB down to 6 MB

directionmusicale.jpg alone was 19 MB at 6048x4024, and nine more photos were
over 2 MB each — a compression problem rather than a dimension one, since most
were already 1920px wide. Longest edge 1920, JPEG q82, progressive, EXIF
stripped. The logo, comite.jpg, the CD cover and the flyer are untouched: they
are already small and re-encoding them would only soften them.

The budget is written into CLAUDE.md, because nothing in the test suite or the
linters can catch a camera original being dropped in."
```

---

## Task 2: The token system

**Files:**
- Modify: `package.json` (via `npm install`)
- Modify: `web/src/styles.css`

- [ ] **Step 1: Install the two faces**

```bash
npm install @fontsource-variable/karla @fontsource/lilita-one
```

Both are confirmed present on npm at 5.3.0. They are **runtime dependencies**, not dev ones — the font files ship in the bundle.

Self-hosted rather than Google's CDN for three separate reasons, any one sufficient: a Swiss band site should not hand every visitor's IP to a third party; TEST and QA sit behind HTTP Basic Auth, where a blocked third-party request is an easy thing to misdiagnose; and the build stays self-contained, which is what the rest of this project already insists on.

- [ ] **Step 2: Write the tokens**

Replace the whole of `web/src/styles.css` with:

```css
/* Font faces first: a CSS @import has to precede every rule, and Vite resolves
   these bare specifiers to the packages in node_modules. Self-hosted on
   purpose — see docs/superpowers/specs/2026-08-29-visual-foundation-design.md. */
@import "tailwindcss";
@import "@fontsource-variable/karla";
@import "@fontsource/lilita-one";

/**
 * The "Scène" palette.
 *
 * Chosen for who uses this site rather than for how it photographs: the nine
 * public pages are read once by a stranger, while the members' area is read
 * every week, on a phone, outdoors, by someone checking whether they play on
 * Saturday. So the CHROME is black and neon — the header is the stage — and the
 * page body is light.
 *
 * The band is a youth Guggenmusik that performs in UV costumes at night, and
 * the old site's background was a neon splatter on black. Neon on black IS the
 * identity; anyone tempted to neutralise this palette should open
 * web/public/assets/img/canetons.jpg first.
 *
 * --color-* is Tailwind 4's theme namespace, so --color-violet gives you
 * bg-violet, text-violet, border-violet and so on. There is no
 * tailwind.config.ts in this project and there should not be one.
 */
@theme {
  --color-ground: #f7f8fa;
  --color-panel: #ffffff;
  --color-ink: #14121c;
  --color-ink-muted: #5a5768;
  --color-line: #e2e3ea;

  /* The header, and only the header. */
  --color-stage: #0b0a12;

  /* The interface accent: links, the active nav item, primary buttons. */
  --color-violet: #4b2ed6;

  /* Emphasis only — never a whole surface. */
  --color-pink: #ff3d9a;

  /* Errors, and the non-prod ribbon, which is the same meaning. This replaces
     --color-canetons-red, which did double duty as brand AND error. In this
     palette red is not a brand colour — violet is — so red is free to mean
     exactly one thing. */
  --color-danger: #e0201a;

  --font-sans: "Karla Variable", "Segoe UI", system-ui, sans-serif;
  --font-display: "Lilita One", "Karla Variable", system-ui, sans-serif;
}

/* The page's own ground and default face. Everything else is a utility class. */
body {
  background-color: var(--color-ground);
  color: var(--color-ink);
  font-family: var(--font-sans);
}

/* Headings are set in the display face wherever a page asks for it via
   font-display; balance keeps a two-line French title from orphaning a word. */
h1,
h2 {
  text-wrap: balance;
}
```

**On the type scale.** The spec names one — `0.75 · 0.875 · 1 · 1.125 · 1.375 ·
1.75 · 2.25 · 3` rem — and this plan deliberately does **not** encode it as
`--text-*` overrides. Redefining Tailwind's scale silently changes the meaning
of every `text-sm` / `text-xl` already written across eight files, which turns a
token change into an invisible restyle of things nobody looked at. Tailwind's
own steps land within a few hundredths of the spec's at every size the pages
actually use, so the pages use those. If a genuinely custom step is needed
later, add one named token rather than replacing the scale.

- [ ] **Step 3: Verify the CSS compiles**

Run: `npm run build`
Expected: exit 0. Then confirm the fonts were actually bundled:

```bash
ls dist/build/assets/ | grep -iE "karla|lilita" | head
```

Expected: at least one woff2 per family. **If nothing matches, the `@import`s did not resolve** and the page is silently falling back to system fonts — which looks plausible enough to miss. Stop and report rather than continuing.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json web/src/styles.css
git commit -m "feat(web): the Scene token system, with self-hosted faces

Tokens for the palette, and Karla and Lilita One through Fontsource rather than
Google's CDN — a Swiss band site should not hand every visitor's IP to a third
party, TEST and QA sit behind Basic Auth where a blocked third-party request is
easy to misdiagnose, and the build stays self-contained.

--color-canetons-red is gone: it meant both the brand and an error. Violet
carries the interface now, so red means only --color-danger."
```

---

## Task 3: The chrome

This is the task that restyles every route at once.

**Files:**
- Modify: `web/src/components/Layout.tsx`
- Modify: `web/src/components/Layout.test.tsx`
- Modify: `web/src/components/EnvRibbon.tsx`

- [ ] **Step 1: Change the nav-active test first**

`web/src/components/Layout.test.tsx:71` is the only `toHaveClass` in the whole suite:

```tsx
expect(screen.getByRole("link", { name: "Inscriptions" })).toHaveClass("font-bold");
```

It pins a real behaviour — the two inscription sub-pages highlight the "Inscriptions" item, as the old nav did — but it pins it *through the styling*, so it breaks every time the design moves. Replace it with an assertion on what the behaviour actually means:

```tsx
test("the inscription sub-pages highlight the Inscriptions item, as the old nav did", async () => {
  await renderWithSession(<AppRoutes />, { route: "/inscriptions_admin" });
  // aria-current, not a class: this is the accessible expression of "you are
  // here", it is what a screen reader announces, and it does not have to be
  // rewritten the next time the active item's styling changes.
  expect(screen.getByRole("link", { name: "Inscriptions" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
```

Run: `npx vitest run web/src/components/Layout.test.tsx`
Expected: FAIL — the attribute does not exist yet.

- [ ] **Step 2: Style the header and nav**

In `web/src/components/Layout.tsx`, replace the `<header>` opening and its logo block:

```tsx
      <header className="bg-stage text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          <img
            src="/assets/img/Les_Canetons_Fribourg_logo_2.jpg"
            alt="Logo"
            className="h-16 w-auto rounded"
          />
          <h1 className="font-display text-2xl leading-none">
            Les <span className="text-pink">Canetons</span> de Fribourg
          </h1>
        </div>
```

The band name is currently "Guggenmusik Les Canetons de Fribourg" in one weight. Splitting it lets the display face carry the name and the pink pick out the word that matters; the full legal name stays in the footer.

Then the nav. Replace the `<nav>` element's opening tag and the hamburger button:

The nav stays **inside** the `<header>` element — that is where it already is,
and moving it would change the document outline for no benefit. It simply paints
itself as a light panel, so visually it reads as a bar below the dark stage
rather than part of it:

```tsx
        <nav className="border-t border-white/10 bg-panel text-ink">
          <button
            type="button"
            aria-label="Menu de navigation"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="m-2 rounded p-1 text-ink md:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
```

**Leave `aria-label`, `aria-expanded`, `aria-controls` and the `onClick` exactly as they are** — a test drives them.

Then the list and its items:

```tsx
          <ul
            id="nav-menu"
            className={`${open ? "block" : "hidden"} mx-auto max-w-5xl px-4 pb-3 text-sm md:flex md:flex-wrap md:items-center md:gap-5 md:py-2`}
          >
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  aria-current={active === item.to ? "page" : undefined}
                  className={
                    active === item.to
                      ? "border-b-2 border-violet py-1 font-semibold text-violet"
                      : "py-1 text-ink-muted hover:text-ink"
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
```

`aria-current` is set from the same `active` expression the class uses, so the two cannot disagree.

- [ ] **Step 3a: Style the remaining nav items**

The Flickr link and the auth item are in the same list and must not be left in default blue. Give the external link `className="py-1 text-ink-muted hover:text-ink"` on its `<a>`, and the auth `NavLink` the same, plus `font-semibold` so a logged-in username reads as a status rather than as another page.

- [ ] **Step 4: Style the footer**

Replace the footer:

```tsx
      <footer className="mt-16 bg-stage py-8 text-center text-sm text-white/70">
        <p className="mx-auto max-w-5xl px-4">
          © {new Date().getFullYear()} Guggenmusik les canetons de Fribourg. Tous droits réservés.
        </p>
      </footer>
```

It bookends the header, which is what makes the light page body read as the stage's lit area rather than as an unstyled gap.

- [ ] **Step 5: Retoken the env ribbon**

In `web/src/components/EnvRibbon.tsx`, the only change is `bg-canetons-red` → `bg-danger`. **Do not touch the `NON_PROD` logic or the "unknown env means PROD" default** — that default is load-bearing, and the comment above it explains why.

- [ ] **Step 6: Verify**

```bash
npx vitest run web/src/components && npm run typecheck && npm run lint:js
```
Expected: PASS, including the rewritten nav test.

```bash
npm run test:e2e
```
Expected: 11 passed. This is what proves the chrome change did not break any page.

- [ ] **Step 7: Commit**

```bash
git add web/src/components
git commit -m "feat(web): the Scene chrome — header, navigation, footer

The header and footer are the stage: near-black, bookending a light page body.
The active nav item now carries aria-current as well as the violet styling, and
the test asserts the attribute rather than a class — it is what a screen reader
announces, and it does not need rewriting the next time the design moves.

The NAV order is untouched. It is the order the band is used to, not
alphabetical and not the route table's."
```

---

## Task 4: The forms and the pages

**Files:**
- Modify: `web/src/components/FormField.tsx`
- Modify: `web/src/pages/EventForm.tsx`, `EventActions.tsx`, `PlanningRepet.tsx`, `Login.tsx`, `Contact.tsx`, `Confirmation.tsx`, `NotFound.tsx`, `Placeholder.tsx`

**The acceptance criterion for this whole task: not one test may change.** The suite asserts on roles, French text and ARIA attributes — never on classes, now that Task 3 removed the only exception. If a test needs editing here, the restyle changed behaviour and has overreached; stop and report rather than adjusting the test.

- [ ] **Step 1: Retoken the shared form pieces**

In `web/src/components/FormField.tsx`, three occurrences of the old token:

- `FormError`'s message: `text-canetons-red` → `text-danger`
- the control's `className`: `border-canetons-red` → `border-danger`
- the field error `<span>`: `text-canetons-red` → `text-danger`

While there, give the controls a real resting state. In the `shared` object:

```ts
    className: `w-full rounded border bg-panel px-3 py-2 text-ink outline-none focus:border-violet focus:ring-2 focus:ring-violet/30 ${
      problem ? "border-danger" : "border-line"
    }`,
```

`focus:` styling is not decoration — the previous `rounded border p-1` left keyboard focus to the browser default, which on a light ground is nearly invisible.

- [ ] **Step 2: Retoken the two remaining red usages**

- `web/src/pages/NotFound.tsx`: `text-canetons-red` → `text-danger` on the "404".
- `web/src/pages/Placeholder.tsx`: `text-canetons-red` → **remove the colour class entirely.** A placeholder page title is not an error, and this file is scaffolding that A2 deletes.

- [ ] **Step 3: Confirm the old token is gone**

```bash
grep -rn "canetons-red" web/src || echo "clean"
```
Expected: `clean`. A missed rename fails silently as an unstyled element — nothing in TypeScript or the linters will catch it, because Tailwind class names are strings.

- [ ] **Step 4: Style the buttons consistently**

Four components render buttons with `rounded border px-3 py-1` plus, since the accessibility pass, `aria-disabled:cursor-not-allowed aria-disabled:opacity-50`. Give the primary action in each the violet treatment and the secondary one the quiet treatment:

| Button | File | Class |
| --- | --- | --- |
| `Se connecter` | `Login.tsx` | primary |
| `Se déconnecter` | `Login.tsx` | secondary |
| `Envoyer` | `Contact.tsx` | primary |
| `Ajouter` / `Modifier` | `EventForm.tsx` | primary |
| `Annuler` | `EventForm.tsx` | secondary |
| `Modifier` / `Supprimer` (per row) | `EventActions.tsx` | secondary, small |

primary:
```
rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50
```

secondary:
```
rounded border border-line bg-panel px-4 py-2 text-ink hover:border-violet hover:text-violet aria-disabled:cursor-not-allowed aria-disabled:opacity-50
```

`EventActions`' row buttons keep their `flex items-center gap-1` and `text-sm`, and use `px-2 py-1` instead of `px-4 py-2`.

**Keep every `aria-disabled`, `aria-label`, `type` and handler exactly as it is.** Only `className` changes in this step. `Annuler` keeps its real `disabled` attribute — there is a comment in `EventForm.tsx` explaining why it is the one control that should genuinely be disabled.

- [ ] **Step 5: Style the page bodies**

Each page currently has a `<section className="mx-auto max-w-Nxl px-4 py-8">` wrapper and headings in `text-2xl font-bold`. Move the headings onto the display face and give the surfaces a panel where they hold content:

- **`PlanningRepet.tsx`** — the `<h1>` becomes `font-display text-4xl`, the `<h2>` subtitle `text-ink-muted`. Each event `<li>` becomes `relative rounded-lg border border-line bg-panel p-5 shadow-sm`. Keep `relative` — `EventActions` is absolutely positioned inside it. The `<strong>` labels become `text-ink-muted font-semibold`.
- **`EventForm.tsx`** — the `<form>` becomes `mt-8 space-y-4 rounded-lg border border-line bg-panel p-5`, its `<h2>` `font-display text-xl`.
- **`Login.tsx`** — the shared `<section>` keeps its width; the `<h2>` becomes `font-display text-3xl`.
- **`Contact.tsx`** — same treatment; wrap the `<form>` in `rounded-lg border border-line bg-panel p-5`.
- **`Confirmation.tsx`** — `<h2>` to `font-display text-3xl`, and add a violet left rule to the panel so a success page does not read as an error one: `rounded-lg border border-line border-l-4 border-l-violet bg-panel p-6`.
- **`NotFound.tsx`** — the "404" becomes `font-display text-7xl text-danger`; the heading `font-display text-3xl`.
- **`Placeholder.tsx`** — `font-display text-3xl`, no colour class.

- [ ] **Step 6: Verify, and prove the criterion held**

```bash
npx vitest run && npm run typecheck && npm run lint:js && npm run lint:css
```
Expected: **131 tests**, all passing, and `git diff --stat` showing **no `.test.tsx` file changed in this task**. Check that explicitly:

```bash
git diff --name-only | grep -c "\.test\." || echo "0 test files changed — correct"
```

```bash
npm run build && npm run test:e2e
```
Expected: build exit 0, 11 e2e passed.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): put the four ported pages on the Scene tokens

Restyle only: no markup structure, French copy, route or handler changed, and
not one test needed editing — which is the criterion this task was written
against, since the suite asserts on roles and text rather than classes.

Form controls gain a real focus state. The previous 'rounded border p-1' left
keyboard focus to the browser default, which on a light ground is nearly
invisible."
```

---

## Task 5: Look at it, then verify everything

**Files:** none — this task changes nothing.

- [ ] **Step 1: Look at the actual site**

```bash
npm run dev:mock
```

Open http://localhost:5173 and walk every route that exists: `/planning_repet` (logged out, then as `demo.admin`), `/authentification_inscription` (both states), `/contact`, `/confirmation`, and a nonsense URL for the 404. Check on a narrow viewport too — the nav collapses to the hamburger below `md`.

What you are looking for, specifically:

- the header and footer are near-black and bookend a light body;
- the active nav item is violet and underlined;
- **the fonts actually loaded** — headings should be Lilita One, a rounded heavy face. If everything is a system sans, the `@import`s did not resolve, and it looks plausible enough to miss;
- form focus rings are visible;
- the non-prod ribbon is legible against the dark header.

- [ ] **Step 2: Against the real API too**

```bash
npm run dev
npm run build
```

Open http://localhost:5173 — the stack's own unmocked dev server — and confirm the same pages render identically against real data. The point here is data shape, not styling: a real event list is longer and has real French titles with accents.

- [ ] **Step 3: The full gate**

```bash
npm run check
npm run test:e2e
npm run build
npm run smoke
```

and, in PowerShell (or with `MSYS_NO_PATHCONV=1` in Git Bash):

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

Expected: `check` exit 0; 11 e2e; artifact holds `index.html`, `assets/` and `api-laravel/`; 13/13 smoke; 232 Laravel tests.

- [ ] **Step 4: Check what the design cost in bytes**

```bash
du -sh dist/build/assets/
ls -la dist/build/assets/*.css dist/build/assets/*.woff2 2>/dev/null
```

Two self-hosted families are not free. Note the numbers in the handover — if the fonts come to more than a few hundred KB, say so, because subsetting is then worth a follow-up.

- [ ] **Step 5: Update the handover and push**

In `docs/continue-here.md`, record that A1 is done and that A2 — the nine content pages — is next and now lands on an existing system. Add any trap this plan cost you.

```bash
git add docs/continue-here.md
git commit -m "docs: the visual foundation is in; the nine content pages are next"
git push
```

---

## Notes for whoever executes this

- **The one thing that fails silently is the fonts.** A `@import "@fontsource/..."` that does not resolve produces no error, no failing test and no lint warning — the page just renders in a system sans and looks fine. Task 2 Step 3 and Task 5 Step 1 both check for it on purpose.
- **Renaming a Tailwind token has no safety net.** `grep -rn "canetons-red" web/src` returning nothing is the only check that exists.
- **Do not run the image script twice.** JPEG re-encoding is generational; `git checkout web/public/assets/img/` first if you need to retry.
- **Do not re-order `NAV`.** It is the order the band is used to.
- **`Annuler` is the one button that keeps a real `disabled` attribute.** Everything else uses `aria-disabled` plus a guard in the handler, for a reason recorded in the code.
- **If a test needs changing in Task 4, stop.** That is the signal the restyle became a behaviour change.
