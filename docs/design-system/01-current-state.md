# 01 · Current state of the frontend (Phase 1)

> Analysis only. No application code was changed to produce this document.
> Snapshot: branch `ccr-dec058aa-1fvzz2`, equal to `main` at the start of the session (UX review was run on `a869179`).
> Every number below was measured from the code unless it is marked *(UX review)*, which means it comes from the black-box review's computed-style crawl and is a runtime view, not a source view.

## 0. Summary

1. **A small design system already exists, informally.** `web/src/components/ui/` holds 13 vendored shadcn components (ADR 0022), `Button` has 52 importers, `FormField` 28, `PageSection` 32. The work is to give that layer **boundaries, a semantic token tier and a public API**, not to start from nothing.
2. **The ui/ folder is clean; everything around it is not.** 12 of 13 `ui/` files import nothing a design system must not know. `toast.tsx` imports i18n (for "Fermer"). The first real leaks are `FormField` (i18n `t()` and `TranslatedError`), `ButtonLink` (i18n router wrapper), `Footer`/`Logo`/`social` (content-editing code), and `carnival/Highlighted` (reaches into `content/editor`).
3. **Tokens are well-disciplined, but flat.** Colour is almost entirely token-based (467 brand-token class uses vs. 4 off-palette). What is missing is a *semantic* tier (`action`, `feedback`, `surface`), and scales for radius, type size, z-index and motion.
4. **The real drift is in the small-component layer**, matching the UX review: 9 hand-rolled badge strings, 6 identical hand-written `<select>` class strings, 8 raw checkboxes (root cause of #390), `Card` imported by only 8 files while the review counts 79 surface instances, and **four different focus-ring mechanisms** (root cause of #391).
5. **Zero circular dependencies** among app modules, which makes extraction cheap. There are also **zero boundary rules** today beyond three `no-restricted-imports`/`no-restricted-syntax` rules.
6. **No workspaces.** One root `package.json` holds every dependency (all in `devDependencies`, all caret ranges), `web/` has no `package.json`, one `tsconfig.json`, and the `@/` alias is declared in **three** places that must agree.

---

## 1. Tokens

### 1.1 What `@theme` defines (`web/src/styles.css`)

| Category | Tokens | Notes |
| --- | --- | --- |
| **Colour: surfaces/text** | `ground #fff7ec`, `panel #fff`, `ink #14121c`, `ink-muted #5a5768`, `line #e2e3ea`, `stage #0b0a12` | Names are roles already (ground, panel, ink), not hues. |
| **Colour: brand** | `violet #4b2ed6`, `pink #ff3d9a`, `danger #e0201a`, `yellow #ffd23f`, `cyan #2ee6d6`, `lime #b6f23a`, `lilac #b9a8ff` | Hue names. `violet` doubles as "interface accent" and `danger` as "error"; the *role* lives in a comment, not in a name. |
| **Colour: hover** | `yellow-hover`, `violet-hover`, `danger-hover`, `ink-hover` | Hand-picked per colour. |
| **Colour: tag chips** | 8 pairs `tag-<name>` / `tag-<name>-ink` | 16 tokens, mapped from the API's `TagColour`. |
| **Shadow** | `raised 5px`, `raised-sm 3px`, `raised-stage 4px (pink)`, `raised-pressed`, `raised-stage-pressed`, `toast` | The signature "hard offset" look. Colour is baked into the token, so the `page`/`stage` choice has to be a component prop (see Button). |
| **Spacing** | `touch 2.75rem`, `tight .5rem`, `related 1rem`, `block 2rem`, `section 4rem` | Relationship-named vertical scale. Only a *convention*, not enforced (comment says so). |
| **Container** | `shell 72rem`, `text 44rem` | |
| **Typography** | `font-sans` (Karla Variable), `font-display` (Bungee) | **No size, weight or line-height tokens**; Tailwind's default `text-*` scale is used as is. |
| **Motion** | `animate-reveal`, `roll-up`, `ribbon-in`, `toast-in`, `wobble` (+ keyframes) | Animations only; **no duration/easing tokens**. |
| **Radius** | via `@theme inline`: `sm 4px`, `md 6px`, `lg 8px`, `xl 12px` (all derived from `--radius: .5rem`) | This is shadcn's scheme, overriding Tailwind's defaults. |
| **Breakpoints** | none customised | Tailwind defaults (`sm 40rem`, `md 48rem`, `lg 64rem`, `xl 80rem`). |
| **Z-index** | none | |

A second vocabulary sits on top: **shadcn aliases** (`--primary`, `--accent`, `--ring`, `--border`, …) declared on `:root` and re-exported by `@theme inline` as `--color-primary` etc. They alias the brand tokens and introduce no colour (ADR 0022). Usage tells the story: **brand tokens ≈ 467 class uses; shadcn aliases ≈ 40**, almost all inside `components/ui/`. So there are two names for the same thing (`bg-violet` / `bg-primary`) and application code only speaks one of them.

Custom utilities in the same file: `focus-ring`, `focus-ring-stage`, `press-quiet`, `bg-poster`, `heading-wave`, `bg-highlight`.

### 1.2 Values that escape `@theme`

**In CSS (`styles.css` itself)**

| Value | Where | Why it escapes |
| --- | --- | --- |
| `#fff` | `--primary-foreground`, `--destructive-foreground`, `.focus-ring-stage` | Should be a `--color-on-*` token. |
| `#7a2fd0` | `bg-poster` gradient midpoint | The only colour that has no token at all. |
| `#ff3d9a` (URL-encoded `%23ff3d9a`) | `heading-wave` data-URI | A data URI cannot read `var()`; a **duplicate of `--color-pink`**. |
| `rgba(20, 18, 28, 0.32)` | `--shadow-toast` | Duplicate of `--color-ink` as rgb. |
| `color-mix(… ink 5% / 11%)` | `press-quiet` | Fine (derived from tokens). |

**In TS/TSX** (non-test, non-mock)

| Kind | Count | Where |
| --- | --- | --- |
| Hex colour | 3 | `#fff` in `carnival/PageHero.tsx`, `pages/Home.tsx` (confetti colour list) and `images/shrink.ts` (canvas fill; not UI). |
| `rgb()/hsl()` | 0 outside mocks | |
| Inline `style={…}` | 6 files | `ConfettiPiece`, `Scallop` (SVG fill from props), `BlockEditor` (keyboard inset), `indicator` (computed offset), `sonner` (`--width`), `toast` (progress height). All are **dynamic values**, none is a hard-coded design value. |
| Off-palette Tailwind colours | 4 | `text-red-700` ×3 (`EventAttendance`, `Events`, `EventRegistrations` load errors), `text-gray-600` ×1 (`guards.tsx`). This is the "different red" the UX review saw. |

**Arbitrary Tailwind values** (selected, design-relevant ones; structural ones such as `data-[state=…]`, `grid-cols-[…]`, `translate-[-50%]` are omitted):

| Category | Arbitrary values | Count |
| --- | --- | --- |
| Radius | `rounded-[18px]` ×6, `[20px]`, `[14px]`, `[4px]`, `rounded-t-[18px]` | 10 |
| Type size | `text-[13px]` ×2, `[10px]` ×2, `[11px]` ×2 (one is `sm:text-[11px]`), `[8px]`, `[22px]` | 8 |
| Z-index | `z-[35]` ×3 (next to `z-10/30/40/50`) | 3 |
| Shadow | `shadow-[0_-6px_0_0_rgb(0_0_0/0.15)]` (bottom-sheet) | 1 |
| Ease | `ease-[cubic-bezier(0.2,0.8,0.2,1)]` ×2 (a *different* bezier than `--animate-toast-in`) | 2 |
| Breakpoint | `max-[379px]` ×3, `min-[601px]` | 4 |
| Tracking/leading | `tracking-[0.3em]`, `[0.28em]`, `leading-[1.18]` ×4 | 6 |
| Sizes/positions | `w-[400px]`, `max-w-[680px]`, `size-[76px]`, `top-[16/22/30px]`, … | ~25 |

### 1.3 Scale usage (counts of class occurrences)

| Scale | What is used |
| --- | --- |
| **Radius** | `rounded-md` 32, `rounded-full` 31, `rounded-xl` 21, `rounded-lg` 19, bare `rounded` 10, `rounded-sm` 3, `rounded-2xl` 2, arbitrary 10. Theme values are 4/6/8/12; **14, 16, 18, 20 are strays**, exactly the *(UX review)* list. |
| **Type size** | `text-sm` 158, `xs` 23, `xl` 21, `3xl` 18, `lg` 12, `2xl` 12, `base` 10, `4xl` 7, plus arbitrary 8/10/11/13/22 px. *(UX review)*: 15 distinct rendered sizes. |
| **Shadow** | `shadow-raised-sm` 5, `shadow-raised` 4, `shadow-lg` 4, `shadow-sm` 3, `shadow-toast`, `shadow-raised-stage`, `shadow-xs`. `shadow-lg/sm/xs` are shadcn defaults; they are a second shadow language. |
| **Z-index** | `z-10` 8, `z-50` 7, `z-[35]` 3, `z-40` 3, `z-30` 2. Unmanaged. |
| **Breakpoints** | `sm:` 77, `md:` 41, `xl:` 28, `lg:` 6, plus 4 arbitrary. `md` is the phone/desktop boundary for layout. |
| **Motion** | `duration-200` ×4, `transition` / `-all` / `-transform` / `-colors` scattered, `animate-in/out` (Radix/shadcn), custom `animate-*` ×6. Reduced motion is handled **once, globally** in `styles.css` (good pattern). |
| **Focus** | **Four mechanisms:** (a) `focus-ring` utility, 2 px violet outline, ×20; (b) `focus-ring-stage`, white outline, ×11; (c) shadcn `focus-visible:ring-[3px] ring-ring/50` in Button/Input and friends, ×10 (this is the ring measured at 2.5:1 in #391); (d) ad-hoc `focus-visible:outline-*`, ×10. |

---

## 2. Components

Method: every `.tsx` under `web/src` except `api/generated`, `mocks`, tests and `test/` (146 files) was classified from its **static imports** (see §3 for the tool).

- **presentational**: no router, session, orval, TanStack Query, react-hook-form/zod and **no i18n**.
- **mixed**: otherwise presentational but imports i18n (text is baked in). These are the split candidates: *the logic is fine, the strings should arrive as props*.
- **feature**: imports any of orval hooks, TanStack Query, React Router, the session, react-hook-form or zod.

| Class | Files | Note |
| --- | --- | --- |
| presentational | 28 | Includes `pages/DevUi.tsx`. |
| mixed (i18n only) | 31 | |
| feature | 87 | 30 of the 31 files in `pages/` plus domain folders (`events`, `booking`, `members`, `images`, `history`, `content`). |

This is a heuristic: a file can be "presentational" by imports yet reach into app code (see `social.tsx`, `Highlighted.tsx` below), and a "feature" file can be 90 % layout.

### 2.1 The design-system candidates, file by file

| File | Class | Imports a DS must not know | Verdict |
| --- | --- | --- | --- |
| `ui/button.tsx` | presentational | none | **DS primitive as is.** cva, Slot, `surface` prop. |
| `ui/icon-button.tsx` | presentational | none | Primitive. |
| `ui/input.tsx` | presentational | none | Primitive. |
| `ui/card.tsx` | presentational | none | Primitive, but see §4 (shadcn look ≠ carnival look). |
| `ui/dialog`, `alert-dialog`, `dropdown-menu`, `radio-group`, `switch`, `indicator`, `form-actions`, `sonner` | presentational | none | Primitives/composites. |
| `ui/toast.tsx` | **mixed** | `i18n` (close label) | Split: label becomes a prop; the `notify()` wrapper stays an app-level adapter. |
| `PageSection.tsx` | presentational | none | Pattern (layout). |
| `Notice.tsx` | presentational | none | Composite. |
| `Avatar`, `EnvRibbon`, `ContactLink` | presentational | none | Avatar is a primitive; EnvRibbon is app chrome; ContactLink is domain. |
| `FormField.tsx` | **mixed** | `i18n` (`t`, `TranslatedError`) | The Phase 5 composite. Needs a split: pure field wiring (label, hint, error, `aria-*`) vs. `useBrowserProblem` + `formIsValid` (browser-validation messages translated through `t()`). |
| `SearchField`, `ConfirmByTypingName`, `RowActions` | mixed | `i18n` (+ `i18n/routing` for RowActions) | Composites after splitting out strings and links. |
| `ButtonLink.tsx` | mixed | `i18n/routing` (`Link` that keeps the locale prefix) | Should become `Button asChild` + the app's `Link`. |
| `NavEntry`, `DesktopNav`, `PhoneNav`, `Logo`, `Footer`, `Layout`, `guards`, `LeaveGuard`, `MustChangePassword`, `ScrollToTop`, `RegisterIndex`, `SuspectFlag`, `Tbd`, `PhotoPending` | mixed / feature | i18n, router, session, **content-editing** (`Footer` imports `SiteEditor`, `EditChip`, `EditMode`) | **App layer.** Stay in the app. |
| `social.tsx` | presentational | `content/registry`, `content/types` | Imports *types and a registry from app code*; a data dependency the import heuristic cannot see as a violation. |
| `carnival/Scallop`, `Confetti`, `ConfettiPiece`, `celebrate`, `PageHero`, `raised.ts` | presentational | none, except `PageHero`→`Highlighted` | Decoration layer of the brand; DS or theme? (open decision). |
| `carnival/Highlighted.tsx` | presentational | `content/editor/markTokens` | **Layering inversion**: decoration depends on the editor. |

### 2.2 Domain widgets that behave like DS components

`events/TagChip`, `components/SuspectFlag`, `session/AccountMenu` (count dot), `components/Layout` (count dot), `members/LoginState`, `pages/Members`, `pages/EventRegistrations`: all of these are **badges** written by hand (§4).

---

## 3. Dependency graph

**Tool:** `dependency-cruiser` 18.7.2 (current on npm; requires Node `^22 || ^24 || >=26`; it ran on Node 22.23). It was installed in a scratch directory **outside the repo**, so no repo file changed. Config: `--no-config`, tsconfig `paths` resolved, tests and `mocks/` excluded. Raw output and the classification script are in the session scratchpad, not in the repo. Reproduce with `npx depcruise --ts-config tsconfig.json --exclude '\.test\.|/test/|/mocks/' web/src`.

Results:

- **Circular dependencies in app code: 0.** (The 6 cycles found are inside `node_modules`: zod, dom-accessibility-api, testing-library.)
- **Boundary violations: 0**, but there is no rule set to violate; this is not evidence of good boundaries.
- **Most depended-on UI files** (importers): `ui/button` 52, `PageSection` 32, `carnival/raised.ts` 31, `FormField` 28, `ui/icon-button` 18, `ui/form-actions` 18, `ui/alert-dialog` 13, `PageHero` 8, `ui/card` 8, `ButtonLink` 7, `Notice` 7.

**Per folder: files that import what a design system must not know**

| Folder | Files | orval | TanStack Query | Router | i18n | zod/RHF | session |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `components/` | 39 | 1 | 0 | 5 | 19 | 0 | 4 |
| `components/ui/` | 13 | 0 | 0 | 0 | **1** (`toast`) | 0 | 0 |
| `carnival/` | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| `content/` | 32 | 2 | 1 | 1 | 24 | 5 / 12 | 4 |
| `pages/` | 31 | 28 | 21 | 10 | 30 | 0 | 9 |
| `events/`, `booking/`, `members/`, `images/`, `history/` | 65 | 40 | 10 | 2 | 47 | 0 | 6 |

**Where UI depends on what a DS must not know (the real leaks)**

| UI file | Leaks | Fix direction |
| --- | --- | --- |
| `components/FormField.tsx` | `i18n` (`t`, `TranslatedError`) | strings and error as props; keep translation in an app hook |
| `components/ui/toast.tsx` | `i18n` | `closeLabel` prop |
| `components/ButtonLink.tsx`, `NavEntry`, `RowActions` | `i18n/routing` (locale-aware `Link`) | `asChild`/slot; app supplies `Link` |
| `components/Footer.tsx`, `Layout.tsx` | `content/*` editing UI, `session`, orval | stay in the app |
| `components/social.tsx` | `content/registry`, `content/types` | move icon map to the app, or take plain props |
| `carnival/Highlighted.tsx` | `content/editor/markTokens` | invert: markup tokens are parsed by the app and `Highlighted` receives nodes |

**Not leaking, worth noting:** `react-router-dom` and `sonner` are already forbidden from direct import by ESLint (`i18n/routing.tsx` and `ui/toast.tsx` are the sanctioned wrappers). That is the **existing precedent for adapters**.

---

## 4. Duplication and drift

| Pattern | Evidence | Root cause |
| --- | --- | --- |
| **Badge/chip** | 9 hand-rolled `rounded-full … text-xs` strings in 6 files (`Members`, `EventRegistrations` ×4, `LoginState`, `AccountMenu`, `Layout`, `SuspectFlag`) + `TagChip` + `Indicator` (cva). Border, weight, padding differ. *(UX review)*: 17 signatures. | no `Badge` primitive; #385 |
| **Surface/card** | `ui/card.tsx` has 8 importers; hand-written `rounded-[18px]/[20px] border-2/3 border-ink …` elsewhere. `Card` default is shadcn (`rounded-xl border shadow-sm py-6`), the carnival card is `rounded-[20px] border-3 border-ink shadow-raised`. *(UX review)*: 79 instances, 47 signatures. | two visual languages for "card" with only one of them a component; #386 |
| **Select** | the identical string `focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink` appears **6×** in 4 files (`MemberForm` ×3, `Members` ×2, `SeriesForm`). Input uses *different* classes (`border-input`, `bg-transparent`, ring-3 focus). | no `Select` primitive; not in the review's list: **new finding** |
| **Textarea** | exists only inside `FormField`, hand-written with `focus-ring … border-line bg-panel`; the file's own comment says it is "kept in step by hand" with `Input`. | no `Textarea` primitive |
| **Checkbox** | 8 raw `<input type="checkbox">` with `size-5` or `mt-1 size-5`, no `shrink-0`. | no `Checkbox`; the flex shrink is the cause of #390 |
| **Error colour** | `text-danger` (token) vs `text-red-700` ×3 and `text-gray-600` ×1 for load/guard messages. | no `StateMessage`; #387, #388 |
| **Focus ring** | four mechanisms (§1.3). | shadcn's ring was vendored next to the project's own `focus-ring`; #391 |
| **Button sizes** | `size` variants set `h-9/h-8/h-10/h-6`, but the base has `min-h-touch` (44 px), and CSS `min-height` beats `height`. **All four text sizes render ≥ 44 px; only padding and text size differ.** Hero/submit buttons reach 48 px by extra classes. *(UX review)* saw padding 12/16/20 px on "the same" size. | the `h-*` classes are dead weight; #397 |
| **Two token vocabularies** | brand (`bg-violet`) vs shadcn (`bg-primary`) | by design (ADR 0022), but nothing says which is public |
| **cva** | only 2 definitions: `buttonVariants`, `indicatorVariants`. Everything else is `cn("…")` with string conditionals. No overlap between the two cva sets. Button's `variant × surface` is encoded as **compound variants** that exist only because the shadow *colour* is baked into the token. | variants live in strings, not types |

What already works and should be **kept**, not redesigned: `FormActions` (one form footer), `IconButton` (only legal icon-only button, lint-enforced), `notify()` toast wrapper, the global reduced-motion rule, the `aria-disabled`-instead-of-`disabled` convention for buttons (focus is not lost on submit), `Input`/`FormField` linking `aria-describedby`.

---

## 5. Existing build setup

| Aspect | Today |
| --- | --- |
| Packages | **One** `package.json` at the root (`les-canetons-website`, `private`, `type: module`). `web/` has none. **No `workspaces`.** |
| Dependencies | everything, including `react`, `react-dom`, `tailwindcss`, `vite`, `radix-ui`, in **`devDependencies`** (the output is a static bundle). Caret ranges (`^`). `dependencies` holds only fonts, `zod`, `react-hook-form`, `@hookform/resolvers`, `fflate`. |
| Versions installed | React 19.2.8, TypeScript 6.0.3, Vite 8.3.5, Tailwind 4.3.3 (+ `@tailwindcss/vite` 4.3.3), Vitest 4.1.10, `radix-ui` 1.6.7 (the monolithic package), `lucide-react` 1.35, `sonner` 2.0.8, `@vitejs/plugin-react` 5.2.0. |
| TypeScript | a single `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `moduleResolution: bundler`, `noEmit`, `paths: { "@/*": ["./web/src/*"] }`, `include: web/src, web/e2e, web/screenshots` and 3 root configs. **No project references**, no `baseUrl` (deprecated in TS 6). |
| `@/` alias | declared in `tsconfig.json`, `vite.config.ts`, **`vitest.config.ts`** (a separate config) and `components.json` (shadcn CLI). The files themselves warn they must agree. A new `@ds` alias would be a **fourth** place. |
| Vite | `root: "web"`, `outDir ../dist/build`, plugins `react()` + `tailwindcss()`; `--mode mock` (MSW), `--mode preview` (base `/website-les-canetons/pr-<n>/`, `outDir ../dist/preview`). |
| Tailwind | v4 CSS-first via `@tailwindcss/vite`; no `tailwind.config.*`; **no `@source` directives anywhere** (automatic detection). Behaviour for code outside `web/` has to be verified, see below. |
| Fonts | Fontsource, imported at the top of `styles.css` (`@fontsource-variable/karla`, `@fontsource/bungee`). |
| Quality gates | ESLint 9 flat config (typescript-eslint, react-hooks; *no type-aware rules*), Stylelint (Tailwind at-rules ignored), Prettier (`singleQuote: false`, `printWidth: 100`), Husky + lint-staged, `tsc --noEmit`, Vitest (jsdom, forced `America/New_York` TZ), Playwright + axe (`web/e2e/a11y.spec.ts`), Lighthouse budget, plus node tests in `tools/` that guard design rules (`form-actions.test.mjs`, `button-cursor.test.mjs`, `public-url.test.mjs`). |
| Existing "playground" | `/dev/ui` (`pages/DevUi.tsx`), mounted only under `import.meta.env.DEV` and listed in `web/screenshots/pages.json`, so every screenshot sweep captures it. |
| CI | `ci.yml` jobs: `changes`, `lint-api`, `tests-api`, `assets`, `guard`, `build`, `openapi-drift`, `pr-title`, `all-green` (single required check), `deploy-test`. Separate `preview.yml` (GitHub Pages, `build-preview.mjs`), `lighthouse.yml`, `deploy-qa/prod.yml`. |
| Deploy | `tools/build.mjs` builds the SPA **then** copies Laravel in (order is load-bearing). The artifact is uploaded over FTP. The design system compiles into the SPA bundle, so **only a build-order or install change could affect deploy**. |
| Node | there is **no `.nvmrc`** in this repo. |

**Not verified in this session:** how Tailwind 4's automatic source detection treats a package *outside* `web/` or inside `node_modules`. The Tailwind docs host (`tailwindcss.com`) is not reachable from this session's network. Phase 3 therefore treats `@source` as "will be proven by a spike in Phase 5", not as a fact.

---

## 6. Comparison with the UX review

Source: milestone **UI/UX Improvements** (#11, 17 open issues), review report and inventory on the `ux-review/assets` branch (`docs/ux-review/REPORT.md`, `data/components.json`). The review's issue numbers `001–016` were drafts; the real issues are `#385–#401`.

| Review candidate | Real issue | In code today | Status |
| --- | --- | --- | --- |
| Badge | #385 | `TagChip`, `Indicator`, 9 hand-rolled strings | **partial**: pieces exist, no primitive |
| Surface | #386 | `ui/card.tsx` (shadcn look), 8 importers; carnival card is hand-written | **partial**: wrong variant is the component |
| StateMessage | #387, #388 | `Notice` (inline note), `FormError` (live region), 3 hand-rolled `text-red-700` paragraphs | **new** (Notice is a base to build on) |
| Button + padding drift | #397 | `Button`, 5 variants, `surface` | **exists**; sizes need cleaning |
| Focus indicator | #391 | 4 mechanisms | **exists as a defect**; a token + one utility fixes it |
| Checkbox shrink | #390 | no `Checkbox` | **new primitive** (cause is the missing component) |
| Token scale doc | #398 | no scale tokens for radius/type/z/motion | **new** |
| Form field | (not a candidate in the review) | `FormField` | **exists, mixed**; the Phase 5 composite |
| Alert dialog, Toast | – | `alert-dialog`, `toast` (ADR 0042) | exists |
| Row actions | #379–#383 | `RowActions`, `ActionBar` work in progress | exists / separate track |
| Page header | – | `PageHero`, `PageSection` | exists |
| Not on the review's list, **found in code** | – | `Select` ×6 clones, `Textarea` (private to FormField) | **new gaps** |
| Not DS work | #389 route titles, #393 editor text, #394 sending state (partly a Button `loading` state), #395/#396 performance, #392 heading levels, #399 copy, #400 target size | – | app or content issues; #394 and #400 touch the component contract |

The review is runtime-measured and the code agrees with it on every point I could check, which is a good sign for trusting its other numbers. Roadmap (Phase 6) will reference these issues rather than duplicate them.
