# 02 · Target architecture (Phase 2)

> Independent of where the code lives (that is Phase 3). Concepts are explained where they first appear, with one source each. **Links were not fetched in this session** (the network allows no docs hosts), so treat them as pointers, not as verified quotes.

## 0. The one idea

A design system is a set of **layers where dependencies only point inward**. The inner layers are stable and know nothing about the app; the app is the outermost, most volatile layer and may use everything inside it. Everything below is a consequence of that sentence.

*Further reading:* Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (the dependency rule), and Brad Frost, [Atomic Design](https://atomicdesign.bradfrost.com/) (the vocabulary of primitives → composites → patterns).

---

## 1. Layers

```text
 outer  ┌───────────────────────────────────────────────────────────┐
        │ 5  App features       pages/, events/, members/, …        │
        │    own data (orval), routing, i18n, session, forms logic  │
        ├───────────────────────────────────────────────────────────┤
        │ 4  Patterns/layouts   PageSection, PageHeader, FormLayout │
        ├───────────────────────────────────────────────────────────┤
        │ 3  Composites         FormField, Dialog, EmptyState,      │
        │                       StateMessage, Notice, Toast card    │
        ├───────────────────────────────────────────────────────────┤
        │ 2  Primitives         Button, IconButton, Input, Select,  │
        │                       Checkbox, Badge, Surface, Text, Icon│
        ├───────────────────────────────────────────────────────────┤
        │ 1  Tokens             CSS variables: raw → semantic       │
 inner  └───────────────────────────────────────────────────────────┘
        arrows: 5 → 4 → 3 → 2 → 1   (an inner layer never imports an outer one)
```

| # | Layer | Owns | May import | Today's examples |
| --- | --- | --- | --- | --- |
| 1 | **Tokens** | values: colour, radius, shadow, type, spacing, z, motion | nothing (it is CSS) | `@theme` in `styles.css` |
| 2 | **Primitives** | one HTML element or Radix part, styled by tokens; no knowledge of other components | tokens, React, Radix, cva, `lucide-react` icons passed in or imported | `Button`, `Input`, `IconButton`, `Switch`, `Indicator` |
| 3 | **Composites** | a small group of primitives with one job and a wired-up a11y contract | layers 1–2 | `FormField`, `Dialog`, `AlertDialog`, `Notice`, `FormActions` |
| 4 | **Patterns / layouts** | page-level arrangements with slots | layers 1–3 | `PageSection`, `PageHero`, form/list layouts |
| 5 | **App features** | data, routes, translations, permissions, business rules | everything below, plus app libs | `pages/*`, `events/*`, `Layout`, `guards`, `i18n/routing` |

Two judgement calls, each an open decision for you:

- **Is the carnival decoration (`Scallop`, `Confetti`, `PageHero`) design system or theme?** It is brand expression, optional and heavy. I recommend it is **layer 4 but in a separate entry point** (`@ds/brand`), so a screen that does not want confetti does not pay for it, and so layers 2–3 never import it.
- **Where do `Layout`, `Footer`, nav and the edit-mode chrome go?** Layer 5. They know the session, the content registry and the router. (They *use* DS pieces such as `Button`.)

---

## 2. The dependency rule, made concrete

**What the design system may depend on**

| Allowed | Why |
| --- | --- |
| `react`, `react-dom` | it is a React library (as `peerDependencies` if it is ever packaged) |
| `radix-ui` | behaviour and a11y of dialogs, menus, radios; unstyled |
| `class-variance-authority`, `clsx`, `tailwind-merge` | variant and class composition (the existing `cn()`) |
| `lucide-react` | icons; but **icon choice is the caller's** (see below) |
| `sonner` | only inside the toast adapter, as today |
| Tailwind 4 utilities and the DS's own tokens | styling |
| other DS layers, inward only | the rule itself |

**What it may not depend on**

| Forbidden | Replace it by |
| --- | --- |
| `i18next` / `@/i18n/*` (`t`, `TranslatedError`, locale) | text and `aria-label`s are **props**; defaults, if any, are language-neutral |
| `react-router-dom` / `@/i18n/routing` | `asChild` / render slot: the app passes its own `Link` |
| `@tanstack/react-query`, orval hooks, `@/api/*` | the DS has no data; it renders what it is given |
| `zod`, `react-hook-form`, `@hookform/resolvers` | components are controlled/uncontrolled inputs; form libs adapt *to* them |
| `msw`, `@/mocks`, `import.meta.env` | nothing environment-specific; flags arrive as props |
| `@/session`, permissions (`can()`) | the app decides whether to render the control |
| any app folder (`@/pages`, `@/events`, `@/content`, …) | never |

**How text, links and data get in (the five patterns)**

```tsx
// 1. Text is a prop (or children). The DS never calls t().
<Dialog closeLabel={t("common.close")} title={t("members.delete.title")} />

// 2. Links via asChild (Radix Slot). The app supplies the locale-aware Link.
<Button asChild><Link to="/agenda">{t("nav.agenda")}</Link></Button>

// 3. Slots for structure: named ReactNode props or compound parts.
<PageSection heading={<h1>{t("events.title")}</h1>} actions={<Button>…</Button>} />

// 4. Render props when the DS must hand state back to the caller.
<Tooltip content={t("rows.moveUp")}>{(props) => <button {...props} />}</Tooltip>

// 5. Data in, events out. Server errors arrive as an already-translated string.
<FormField label={t("fields.name")} error={problem?.message} {...register("name")} />
```

Applied to today's leaks:

| Leak | Resolution |
| --- | --- |
| `FormField` calls `t("validation.required")` inside `useBrowserProblem` | `FormField` (DS) takes `error?: string`, `hint?: ReactNode`. The browser-validation hook (`formIsValid`, `useBrowserProblem`) moves to the **app** as `useFieldProblem`, which translates and passes the string down. |
| `toast.tsx` `t("common.close")` | `closeLabel` prop on the card; `notify()` stays an app adapter that supplies it. |
| `ButtonLink` wraps the locale-aware `Link` | delete it; use `Button asChild` + the app `Link`. |
| `Highlighted` parses `markTokens` from `content/editor` | DS `Highlight` renders already-split nodes; the app parses. |
| `social.tsx` reads `content/registry` | app keeps the icon map; DS gets `icon` + `label` props. |

**Icons.** `lucide-react` is allowed, but the DS **does not choose icons for the app's concepts**. Internal icons (a chevron in a select, a check in a checkbox) are fine; "what icon means 'delete'" is app vocabulary and arrives as a prop (`icon={Trash2}`). This keeps ADR 0025's decisions in the app.

---

## 3. Public API

**Principle:** a layer exports a deliberately small surface from one `index.ts`; everything else is internal. This is [information hiding](https://en.wikipedia.org/wiki/Information_hiding) applied to modules: you can change an internal file without breaking any caller.

```text
design-system/
  index.ts              ← the only file the app may import (re-exports layers 2–4)
  tokens/               ← CSS only: tokens.css (+ semantic.css)
  primitives/
    button/  { button.tsx, button.test.tsx, button.stories.tsx, index.ts }
    input/ …
    index.ts            ← layer barrel
  composites/ form-field/ …
  patterns/ page-section/ …
  brand/ index.ts       ← optional entry: Scallop, Confetti (decoration)
  internal/ cn.ts, use-id.ts, a11y.ts   ← NOT exported
```

What is exported per layer:

| Layer | Exports | Stays internal |
| --- | --- | --- |
| tokens | the CSS file + a TS type of token names (optional, for docs) | raw colour tokens: apps use semantic ones |
| primitives | component, its props type, its `variants` function (e.g. `buttonVariants`, needed for `asChild` links) | helper hooks, class constants |
| composites | component, props type | sub-parts not meant to be used alone |
| patterns | component, props type | |

**Enforcement of "only through the barrel"** (details in §8): no import from outside `design-system/` may reach past `@ds` (the barrel), e.g. `@ds/primitives/button/button` is an error from the app. Inside the DS, an inner layer may import another layer's barrel only.

---

## 4. Token format

### The two options

| | **A. Tailwind 4 `@theme` CSS only** | **B. DTCG JSON + Style Dictionary → CSS** |
| --- | --- | --- |
| Source of truth | `tokens.css` | `tokens.json` ([Design Tokens Community Group](https://www.designtokens.org/) format: `$value`, `$type`, aliases `{color.violet}`) |
| Tooling | none; Tailwind and the browser read it directly | `style-dictionary` 5.8.0 (Node ≥ 22) as a build step that writes `tokens.css` |
| Tailwind integration | native (`--color-*` ⇒ `bg-*`) | generated file must emit the exact `--color-*`/`--radius-*` names Tailwind expects |
| Cross-tool value | CSS only | can also emit Figma variables, iOS/Android, JS constants, docs tables |
| Cost | zero | a build step, a generated file to commit or gitignore, two places to look when debugging |
| Review diff | one file | JSON + generated CSS |

### Recommendation for this project: **A, written so it can become B**

There is **one consumer** (the SPA), one platform (web) and one developer, and Tailwind 4's `@theme` is already a token system: it generates utilities, supports aliasing via `var()` and has no build step. Style Dictionary's strength is *multi-platform fan-out*, which this project does not have. The cost (a generator in the critical path of `dev`, `build`, and the three configs that already have to agree) buys nothing yet.

Write option A so the migration is mechanical:

- **Two tiers, named like DTCG groups.** Raw tokens (`--color-violet`) and **semantic tokens that alias them** (`--color-action`, `--color-feedback-error`). This is exactly DTCG's alias model (`{color.violet}`), so a later converter is a one-to-one mapping.
- Keep tokens in **one file** with no logic.
- Name by role (`action`, `feedback`, `surface`, `text`, `border`, `focus`).

*When to revisit:* the day a second consumer needs the same values: Figma variables, an email template, the ADR mock-up HTML files (`docs/adr/0029/mock.html` currently copy values by hand), or a native app.

> **Not verified here:** the current status of the DTCG specification (stable vs. draft) could not be fetched from this session. Check `designtokens.org` before adopting B.

### Proposed semantic tier (derived from what the code actually uses)

| Semantic token | Resolves to (today) | Replaces / unifies |
| --- | --- | --- |
| `--color-surface-page` / `-panel` / `-stage` | `ground` / `panel` / `stage` | `bg-ground`, `bg-panel`, `bg-stage` |
| `--color-content` / `-muted` / `-on-action` | `ink` / `ink-muted` / `#fff` | the loose `#fff` literals. Named `content`, not `text`: `text-text-muted` is ugly and `--color-muted` already exists (shadcn's alias for the page ground), so `text-muted` would paint cream text. **Built in the slice.** |
| `--color-border` / `-strong` | `line` / `ink` | `border-line`, `border-ink` |
| `--color-action` / `-hover` | `violet` / `violet-hover` | `bg-violet`, `bg-primary` (two names today) |
| `--color-action-accent` / `-hover` | `yellow` / `yellow-hover` | `accent` button |
| `--color-feedback-error` / `-success` / `-warning` / `-info` | `danger` / `lime` / `yellow` / `cyan` | `text-danger`, **`text-red-700`**, toast levels (ADR 0042), #387 |
| `--color-emphasis` | `pink` | badges "Provisoire", unread count |
| `--color-focus` / `-focus-on-stage` | new, **≥ 3:1** against page and panel | the four focus mechanisms (#391) |
| `--radius-control` (6) / `-button` (12) / `-surface` (decision: 18 or 20) / `-pill` | consolidates 4/6/8/12/14/16/18/20 | #398 |
| `--shadow-raised-*` colour split into `--raised-color` + offset | see §6 | removes Button's `surface` compound variants |
| `--text-*` scale (xs…4xl) + `--text-label` for the 11/12/13 px runs | collapses 15 rendered sizes | #398 |
| `--z-sticky 10`, `-header 30`, `-overlay 40`, `-modal 50` | `z-10/30/35/40/50` | `z-[35]` ×3 |
| `--duration-fast 150ms`, `-base 200ms`, `--ease-out`, `--ease-spring` | `reveal`, `roll-up`, `toast-in`, 2 stray beziers | motion tokens |

Raw tokens stay for decoration only (`bg-poster`, confetti, tag colours). **Components use semantic tokens; screens may use either during migration**, and a lint rule (later) can narrow that.

---

## 5. Theming

Tailwind 4 turns `@theme` variables into CSS custom properties on `:root`, and utilities read `var(--color-…)` at paint time. **A theme is therefore "re-declare some variables under a selector".** No JS, no class explosion. (Use `@theme inline` only for variables that alias another variable *by value*, because inlining freezes the reference; theme-able tokens must stay non-inline.)

| Need | Mechanism |
| --- | --- |
| **Light/dark** | *Not wanted* (ADR 0022 rejects dark mode and the file warns against a stray `dark:`). If it ever returns: `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` and a `[data-theme="dark"] { --color-surface-page: …; … }` block overriding **semantic** tokens only. Components never change. |
| **Surface (page vs stage)**: *exists today* | Replace Button's `surface="page" \| "stage"` prop and its two compound variants with a **scoped token override**: `[data-surface="stage"] { --color-focus: #fff; --raised-color: var(--color-pink); }`. A Button inside the header then re-colours itself with no prop. This is the best demonstration of the layering in this codebase. |
| **Brand variant** (calm members' area vs carnival public pages, ADR 0029) | Two semantic overrides under `[data-look="calm"]` / `[data-look="carnival"]` (e.g. `--radius-surface`, whether `--shadow-raised` is on). |
| **Future per-site theme** | A new file that only re-declares semantic tokens. |

Rule that makes this safe: **a component may reference only semantic tokens**. Then every theme is a pure CSS change, testable by a Playwright screenshot of the catalogue.

---

## 6. Component contract

A component is not just "a function that returns JSX"; it makes promises. The promises, as a checklist every DS component must satisfy (and each item should be a test, see §8):

**Props**

- Extend the native element: `React.ComponentProps<"button">`, so `onClick`, `aria-*`, `data-*` just work.
- **React 19: `ref` is an ordinary prop**, so no `forwardRef`. Destructure `ref` or pass it through `...props`. (React 19 changelog; verified: the project is on 19.2.8.)
- `className` is accepted and merged **last** through `cn()` (`clsx` + `tailwind-merge`) so a caller can adjust spacing but cannot silently break the variant system.
- `asChild?: boolean` where the element could legitimately be a link or a list item (Radix `Slot`).
- No `any`; no boolean-soup (`primary`, `secondary`, `danger` as booleans): one `variant` union.
- Text is `children` or a labelled prop, never hard-coded.
- `data-slot="…"` on the root (already the shadcn/this repo convention), a stable hook for tests and CSS.

**Variants (`cva`)**

- Variants are **named by role, not by look** (`primary`, `danger`, not `purple`), as in ADR 0040.
- Every variant × size has a defined appearance; invalid combinations are impossible by type (use `compoundVariants` only for real interactions, not to re-encode context that a scoped token can carry; see Button's `surface`).
- Defaults in `defaultVariants`; exported `…Variants` function so links can look like buttons.

**States** (each must be specified, rendered in the playground, and screenshot-testable)

| State | Rule |
| --- | --- |
| default | |
| hover | wrapped in `@media (hover: hover)`; never the only cue |
| `focus-visible` | the single `focus-ring` utility from the `--color-focus` token; **≥ 3:1** against adjacent colours (WCAG 1.4.11) |
| active/pressed | existing press-onto-shadow behaviour |
| disabled | **`aria-disabled` + ignored handler, not the `disabled` attribute** for buttons (existing project rule: it keeps focus on submit). Styled by `aria-disabled:`. |
| loading | `aria-busy="true"` + `aria-disabled`, spinner replaces/accompanies the label, width does not jump, handler ignored (#394) |
| error/invalid | `aria-invalid` + linked message via `aria-describedby`, colour never the only cue |

**Accessibility guarantees (the DS promises these so screens cannot forget)**

1. Interactive targets ≥ 44 px (`--spacing-touch`); the standalone-link case (#400) is a documented exception that needs padding.
2. An icon-only control **must** have an accessible name: required `label` prop, enforced by type.
3. Labels are programmatically associated (`FormField` wires `id`, `htmlFor`, `aria-describedby`, `aria-invalid`).
4. Colour contrast of every token pair used in a component is stated and tested (text ≥ 4.5:1, UI ≥ 3:1).
5. `prefers-reduced-motion` is honoured globally.
6. Keyboard behaviour of Radix parts is not re-implemented.

**Documented but not promised:** the DS does not guarantee i18n, SEO, or data loading; those belong to the app.

---

## 7. Layer-by-layer import matrix (what is allowed to import what)

| from \ to | tokens | primitives | composites | patterns | brand | app | externals (allowed list) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **tokens** | – | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **primitives** | ✓ | ✓ (sibling via barrel, discouraged) | ✗ | ✗ | ✗ | ✗ | ✓ |
| **composites** | ✓ | ✓ | ✓ (sibling) | ✗ | ✗ | ✗ | ✓ |
| **patterns** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| **brand** | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ |
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 8. Enforcement

A rule that is not checked by a machine is a wish. The project already believes this (ADR 0007, `form-actions.test.mjs`), so the boundaries should be **lint errors that fail `all-green`**, not documentation.

| Mechanism | What it checks | Why this tool |
| --- | --- | --- |
| **`eslint-plugin-boundaries`** 7.4.2 (peer `eslint >=6`; project is on ESLint 9 flat config) | layer imports (matrix above), "entry point only" (barrel rule), external imports per layer (allow-list) | runs in the editor and in `lint-staged`, so feedback is instant; declarative element types per folder. *Flat-config usage to be proven in Phase 5.* |
| **`dependency-cruiser`** 18.7.2 as a CI job (and `depcruise --output-type dot` for a picture) | the same rules as a second opinion, **cycles**, **orphans**, "not-to-dev-dep", and a generated graph artifact | independent implementation; catches what the editor plugin cannot (re-exports, dynamic imports), and renders the graph for docs. Used already for Phase 1 with zero setup. |
| **TypeScript** | the public type surface (`exports`-style via barrel; `declaration`-level checks in package approaches). Project references only matter once the DS is its own package (approach 2+). | in approach 1 TS cannot hide a file, so lint carries the boundary |
| **`no-restricted-imports`** (exists) | `react-router-dom`, `sonner` direct imports | keep as is; add `@/` imports from inside `design-system/` |
| **Tests as guards** (exists: `form-actions.test.mjs`, `button-cursor.test.mjs`) | design rules that need parsing source | keep; add one that fails a `<select>`/`type="checkbox"` outside the DS once those primitives exist |
| **`knip`** (optional, later) | exports nobody uses ⇒ API surface that should be internal | keeps the public API honest |

Rule set in words (to be encoded in Phase 5):

1. Files in `design-system/primitives|composites|patterns|brand|tokens` may import only: lower layers (via barrel), the external allow-list, and `design-system/internal`.
2. Nothing in `design-system/` imports `@/…` (app) or any forbidden package.
3. Files outside `design-system/` import only from `@ds` (the barrel) and `@ds/brand`, never from deeper paths.
4. No cycles anywhere in `design-system/`.
5. `npm run lint:boundaries` (`depcruise`) runs as a step of the existing `assets` CI job, which `all-green` already requires, so no new job and no change to `all-green`'s `needs` (the repo's rule: a job protects `main` only once it is listed there). **Built in the slice** and proven with negative tests: a file that breaks each rule fails.
