# 03 · Distribution approaches (Phase 3)

> Question: *where does the design system live and how does the app get it?* The architecture in `02-architecture.md` is the same in every approach; what changes is the **strength of the boundary, the cost of release, and the friction of daily work**.

## 0. Facts that decide this

- **One consumer, one developer, one deploy.** The only app is `web/`. (The author's other repos, `huemi` on StyleX, `miniyard` on Next 14, `schwingkeller`, have different stacks and different looks; none can reuse the carnival design today.)
- **One `package.json`, no workspaces**; every dependency is a `devDependency` with a caret range, `web/` has no manifest; the `@/` alias already has to be kept in sync in 4 places.
- **Build order is already load-bearing** (`tools/build.mjs`: SPA first, then Laravel). The FTP artifact contains only the compiled bundle, so *a design system that compiles into the SPA cannot change what is deployed*. Only changes to install/build order can.
- **PR previews** run `vite build --mode preview` on GitHub Pages with MSW. They only need the app to build.
- The project **already practises approach 5** (ADR 0022: vendored shadcn components owned by the app, `components.json`).
- Tailwind's behaviour for sources *outside* `web/` is unverified in this session (docs unreachable); every approach that moves code out of `web/src` needs a spike to prove the classes are generated. For approaches 2–4 the usual answer is an explicit `@source "../../packages/ui/src"` in `styles.css` (and, for a package in `node_modules`, `@source "../node_modules/@scope/ui"`); I'm stating this as the expected mechanism, not as verified.

### Tool versions checked on the npm registry (this session)

| Tool | Latest | Compatibility with this repo |
| --- | --- | --- |
| React | 19.2.8 installed | `ref` as prop, no `forwardRef` needed |
| TypeScript | **7.0.2 exists; repo is on 6.0.3**, and `typescript-eslint` 8.68 declares `typescript >=4.8.4 <6.1.0` | stay on TS 6; any tool must accept TS 6 |
| Vite | 8.3.8 (installed 8.3.5) | `@tailwindcss/vite` peers include `^8`; `@storybook/react-vite` 10.6.7 peers include `^8` |
| Tailwind | 4.3.5 (installed 4.3.3) | CSS-first, `@theme`, `@source` |
| Vitest | 5.1.0 (installed 4.1.10) | `@storybook/addon-vitest` 10.6.7 peers `vitest ^4 \|\| ^5` |
| Storybook | 10.6.7 | `@storybook/addon-a11y` 10.6.7 |
| Ladle | `@ladle/react` 5.1.1 | peers only React ≥ 18 (it brings its own Vite: a second Vite in `node_modules`) |
| Style Dictionary | 5.8.0 | Node ≥ 22 |
| Changesets | `@changesets/cli` 3.0.3 | monorepo and single-package versioning |
| tsup / tsdown | `tsup` 9.0.0 (no deprecation flag); `tsdown` 0.23.7 (peers TS `^5 \|\| ^6 \|\| ^7`, pre-1.0) | for the built-package approach |
| eslint-plugin-boundaries | 7.4.2 | peer `eslint >=6` |
| dependency-cruiser | 18.7.2 | Node `^22 \|\| ^24 \|\| >=26`; works with the repo's TS 6 (it ran for Phase 1) |

*Not verifiable here:* the Tailwind and DTCG docs hosts. *Node:* there is no `.nvmrc` in this repo, so the Node floor is whatever CI sets; tools above need Node 22+.

---

## 1. In-app module (`web/src/design-system/`, alias `@ds`)

**Structure**

```text
web/src/design-system/
  index.ts  tokens/tokens.css  primitives/  composites/  patterns/  brand/  internal/
web/src/styles.css            ← @import "./design-system/tokens/tokens.css"
```

- **How the app consumes it:** `import { Button } from "@ds"`. A new alias `@ds → web/src/design-system` in `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` (and `components.json` is unaffected).
- **Build/release:** none. It is just source in the app. Every commit is "released".
- **Tailwind:** inside `web/src`, so existing automatic detection applies. No `@source`.
- **Tokens & fonts:** `tokens.css` is `@import`ed by `styles.css`; fonts stay imported by the app.
- **Testing/docs:** tests colocated; the playground runs inside the app's own Vite config (`/dev/ui` or Storybook with `viteFinal`).
- **Boundary strength:** *lint-enforced only*. TypeScript cannot hide a file, so a violation is a red build, not a compile error.
- **CI/deploy:** no change except one new lint job in `all-green`.
- **What you learn:** layers, the dependency rule, public API by barrel, semantic tokens, component contract: **the architecture itself**, with the least packaging noise.

## 2. Workspace package, source-only ("internal package")

**Structure**

```text
package.json                     "workspaces": ["packages/*"]
packages/tokens/  package.json {"name":"@canetons/tokens","exports":{"./tokens.css":"./tokens.css"}}
packages/ui/      package.json {"name":"@canetons/ui","exports":{".":"./src/index.ts"},"peerDependencies":{react,…}}
                  src/…   tsconfig.json
web/                             (still no manifest)
```

- **Consumption:** `"@canetons/ui": "*"` (npm workspaces link it; the `workspace:` protocol is pnpm/yarn, npm uses a plain version/`*` and links by name). Vite compiles the TypeScript source directly; no build step.
- **Build/release:** none. Versions are placeholders (`0.0.0`).
- **Tailwind:** the package sits outside `web/`, so you add `@source "../../packages/ui/src";` in `styles.css` (to be proven by a spike).
- **Tokens & fonts:** `@import "@canetons/tokens/tokens.css"`; the fonts could ship with the tokens package or stay in the app.
- **Testing/docs:** Vitest `include` must also cover `packages/**` (it is `web/src/**` today); ESLint `files` globs, Prettier and Stylelint scripts (`"web/**"`) must be widened; the root `tsconfig.json` `include` too.
- **Boundary strength:** **real**: `packages/ui` can only import what is in its own `package.json`; the app cannot reach un-exported files because of `exports`; a forbidden package (`i18next`) fails to resolve unless declared. Lint becomes a second line of defence.
- **CI/deploy:** `npm ci` now installs workspaces (root lockfile stays single); Dependabot config gains the directories; the `assets`, `build`, `preview` jobs need no new steps. Risk: **husky/lint-staged paths** (`web/**`) and the `tools/*.test.mjs` that scan `web/src` (`form-actions.test.mjs`, `public-url.test.mjs`) will not see `packages/`.
- **Learning:** package boundaries, `exports`, peer dependencies, workspaces, `@source`.

## 3. Workspace package, built (library mode, `exports`, d.ts, Changesets)

Same tree as 2, plus a build per package.

- **Build:** Vite library mode, or `tsdown`/`tsup` (types via `tsc --emitDeclarationOnly`), output `dist/` with ESM + `.d.ts` + the CSS. `exports` points at `dist`. A **dev condition** (`"development": "./src/index.ts"`) restores source-level HMR.
- **Release:** [Changesets](https://github.com/changesets/changesets): a markdown file per change, `changeset version` bumps and writes a changelog. Meaningful only if someone reads the version.
- **Tailwind:** a built package ships compiled JS with class strings; `@source` must point at `node_modules/@canetons/ui/dist` (classes live in the JS, not in a CSS file). Pre-compiled CSS inside the package is the alternative, but then the app's Tailwind config no longer controls the output.
- **Boundary strength:** strongest in-repo: consumers see only `dist` and the types.
- **DX cost:** the app must **build the package before `dev`, `typecheck`, `test` and `build`**: a second ordering constraint beside the SPA→Laravel one, in CI (five workflows), in `tools/build.mjs`, and in the web-session init. Stale `dist` is a classic "my change does nothing" bug.
- **Learning:** library build config, type declarations, `exports` conditions, semver in practice, changelogs.

## 4. Separate repository + published package

- **Structure:** a new repo `canetons-ui` with its own CI, Storybook, release workflow; package published to **GitHub Packages** (private-ish, needs a token) or npm.
- **Consumption:** `"@hoferan/canetons-ui": "1.4.0"` plus `.npmrc` registry/auth in the app repo and in **every workflow that runs `npm ci`** (ci, preview, lighthouse, deploy-*), and for Dependabot.
- **Release:** Changesets → "Version Packages" PR → publish on merge. Semver now has a real reader: the app.
- **Local dev across both repos:** `npm link` (symlink; duplicate-React and Vite `fs.allow` pitfalls) or `yalc` (copies a packed tarball into `.yalc/` and rewrites the dependency; dependable but manual `yalc push` per change). Either way: no atomic commit across repos; a token change touches two repos.
- **Tailwind/tokens/fonts:** as approach 3, plus a published CSS entry for tokens and a decision on who ships the fonts.
- **Deploy impact:** FTP deploy unchanged *if* installs stay reachable from GitHub runners and the web-session container (its network is restricted; registry hosts have to be allowed; see the repo's `docs/web-session.md` on the Composer/GitHub-proxy problem).
- **Refactoring cost:** a cross-cutting change (e.g. renaming a prop) is two PRs, a release and a bump.
- **Learning:** the full lifecycle of a library: semver, deprecation, release automation, consumer upgrade pain. **Honest value only with a second consumer.**

## 5. Copy-in registry (shadcn-style)

- **Philosophy:** a **package** is code you *depend on* (you get updates, you can't edit it). A **registry** is code you *copy* (you own it, you merge upstream changes by hand). Packages optimise for sameness across consumers; registries optimise for each consumer's freedom to diverge.
- **Structure:** components in a registry (`registry.json` + files, built with `shadcn build`), copied by `npx shadcn add <url>` into `web/src/components/ui` (config: `components.json`).
- **What exists today is this approach**: ADR 0022 vendored shadcn; the app has already changed 5 things in `button.tsx` (docblock lists them) that no update could carry.
- **With one consumer a self-hosted registry adds nothing**: the "source" and the "copy" are the same repo.
- **Learning:** why shadcn works for product teams that want to own their look; the cost is **no boundary** and no versioned API. It teaches the opposite lesson of 2–4 and is worth knowing for that.

## Hybrids

| Hybrid | What | Verdict |
| --- | --- | --- |
| **Tokens as package, components in-app** | `@canetons/tokens` is CSS only (no build, no TS); `@ds` stays in `web/src` | Cheap proof of the package boundary on the layer with the *least* risk (CSS). Only worth it with a second token consumer (Figma, mock-up HTML). |
| **1, shaped as a future package** | approach 1, but `design-system/` has no `@/` imports, its own barrel and could be lifted by `git mv` | **Recommended base.** Costs nothing and keeps 2 one afternoon away. |
| **2 for tokens+ui, no build, with Storybook inside `packages/ui`** | – | A natural stop on the way to 3. |

---

## Comparison matrix

Scale: ●●●●● = best for this project, ● = worst.

| Criterion | 1 In-app | 2 Source package | 3 Built package | 4 Separate repo | 5 Registry |
| --- | --- | --- | --- | --- | --- |
| Setup effort | ●●●●● (an alias) | ●●●● (workspaces, widen globs, `@source`) | ●● (build config, types, ordering) | ● (new repo, CI, registry auth) | ●●●●● (exists) |
| Ongoing overhead, one dev | ●●●●● | ●●●● | ●● | ● | ●●●●● |
| Boundary strength | ●●● (lint only) | ●●●●● (resolution + `exports`) | ●●●●● | ●●●●● | ● |
| Versioning/release complexity | ●●●●● (none) | ●●●●● (none) | ●●● (Changesets) | ●● (publish + bump) | ●●●●● (none, no API) |
| DX: HMR, go-to-definition | ●●●●● | ●●●●● | ●●● (needs dev condition) | ●● (link/yalc) | ●●●●● |
| Refactoring cost | ●●●●● (atomic) | ●●●●● (atomic) | ●●●● | ● (two PRs + release) | ●●●●● |
| CI/deploy impact | ●●●●● (lint job) | ●●●● (globs, Dependabot) | ●●● (build step ×5 workflows) | ● (tokens, network, previews) | ●●●●● |
| Learning value (architecture) | ●●●●● | ●●●●● | ●●●● | ●●● | ●● |
| Learning value (packaging/release) | ● | ●● | ●●●●● | ●●●●● | ● |
| Ease of moving to the next | ●●●●● (→2: move folder + manifest) | ●●●● (→3: add build) | ●●● (→4: split repo) | – | ●● (registry→package is a rewrite) |

## Migration path

```text
1 In-app ──► 2 Source package ──► 3 Built package ──► 4 Separate repo
  (≈0.5 d)        (≈1–2 d)            (≈2–3 d + 1 d/yr upkeep)      5 Registry  (sideways; status quo)
```

| Step | What changes | Cost / risk |
| --- | --- | --- |
| 1 → 2 | move `design-system/` to `packages/ui`, add manifest with `exports` + `peerDependencies`, replace the `@ds` alias with the workspace name, widen Vitest/ESLint/Prettier/Stylelint globs, add `@source` | **Low**, *if* the folder has no `@/` imports. The lint rules in approach 1 are exactly the checklist for this move; that is why they are worth writing first. |
| 2 → 3 | add a build, declarations, `exports` to `dist`, a dev condition, build-before-test ordering, Changesets | **Medium**; main risk is stale `dist` and dual-package hazards (two copies of React). |
| 3 → 4 | extract history (`git filter-repo`), registry auth in all workflows, release workflow, link/yalc for local work | **High** for a solo dev; each cross-cutting change gets slower. |
| any → 5 | n/a; the registry is a different philosophy, not a stage | rewrite |

---

## Recommendation

**Start with approach 1, built to be liftable (the second hybrid), and treat approach 2 as an optional Checkpoint-2 exercise.**

Reasoning:

1. **The lesson you want is the architecture** (layers, dependency rule, public API, tokens, contract). Approach 1 teaches all of it with zero packaging noise, and the lint rules from `02-architecture.md` give 90 % of the boundary strength of a package.
2. **There is nothing to version.** One consumer deploys atomically with the library, so semver would be ceremony without a reader. Changesets (approach 3) becomes honest only with a second consumer. None of your other repos qualifies today (different stacks and looks).
3. **Cost asymmetry.** 3 and 4 add ordering constraints across five workflows, the FTP build and a restricted web-session network, i.e. exactly the places this repo's own CLAUDE.md marks as load-bearing, in exchange for learning you can get later and in isolation.
4. **Reversibility.** 1 → 2 costs about half a day *if* we keep `design-system/` free of `@/` imports. If, after the vertical slice, you want to feel package boundaries, promote it to 2 as a deliberate drill and re-measure: that is a cleaner experiment than starting there.
5. **Approach 5 is what you have**; the friction it caused (no boundary, hand-edited vendored files) is the motivating problem.

Dissent worth hearing: if the learning goal weights *release engineering* equally with architecture, go straight to 3 inside the monorepo and accept the build-order cost; that is the best learning-per-risk option among the packaged ones. Approach 4 I'd only do if a second consumer appears.

---

## Playground / documentation tool

| Option | Pros | Cons |
| --- | --- | --- |
| **Storybook 10.6.7** (`@storybook/react-vite`, `addon-a11y`, `addon-vitest`) | industry standard; props table from TypeScript (`autodocs`); every state is a story that doubles as a test fixture (portable stories in Vitest) and as an a11y check; static build can be published next to PR previews | heaviest dev dependency tree, own Vite config to keep aligned (alias, Tailwind plugin), another CI job; ADR 0040 rejected it once as "catalogue page vs. Storybook" and this would reopen that decision |
| **Ladle** 5.1.1 | very light, Vite-based, stories use the same CSF format as Storybook | ships its own Vite (second version), few addons, no a11y panel, smaller ecosystem |
| **Extend `/dev/ui`** (in-app route; mocks already available) | zero new dependencies, already in the screenshot sweep (`pages.json`), sees real providers (router, i18n) | hand-maintained (ADR 0040's own "Bad"), no props docs, isolation is weaker (a component can accidentally depend on app context and still render fine, which defeats the dependency rule) |

**Recommendation: Storybook**, because (a) isolation is part of the lesson: a component that renders in a story with *no* providers proves it does not need i18n or the router; (b) stories are the natural home for "all variants and states" required in Phase 5; (c) the a11y addon and Vitest integration reuse your test stack. Keep `/dev/ui` until the stories cover it, then retire it in the roadmap. **Fallback** if the setup friction is too high: Ladle, then an extended `/dev/ui`.

## Testing strategy

| Layer of test | Tool | What it proves | Trade-off |
| --- | --- | --- | --- |
| **Unit/contract** | Vitest + Testing Library (jsdom; exists) | renders by role/name, forwards `ref` and `className`, variant → `data-*`, keyboard, disabled/loading behaviour, `aria-describedby` wiring | fast, runs in `check`; jsdom has **no layout and no contrast**, so never assert colours here (the repo's other project, huemi, records this for StyleX; here Tailwind classes are present, but computed colour still isn't) |
| **Accessibility** | `axe-core` via Playwright (exists in `web/e2e/a11y.spec.ts`) for real contrast/layout, plus `vitest-axe` (or `jest-axe`) in unit tests for ARIA structure, plus Storybook `addon-a11y` | name/role/label errors per component; contrast on real pages | jsdom axe cannot check contrast; two engines to explain |
| **Visual regression** | Playwright `toHaveScreenshot` of stories or the catalogue | an unintended pixel change (the carnival look is pixel-defined: hard shadows, radii) | baselines **differ between your Windows machine and Linux CI**, the number-one source of flaky visual tests. Mitigation: generate/compare baselines **only in CI on Linux**, or only assert a handful of high-value states. I would add it *after* the slice, not in it. |
| **Boundary tests** | `eslint-plugin-boundaries` + `depcruise` (CI) | the architecture itself | – |
| **Guard tests** (exists) | `node:test` over source | design rules the types can't express | – |

Proposed Phase 5 minimum: unit + axe-in-jsdom per component, Storybook a11y panel, the existing Playwright axe sweep on the migrated screen; screenshots of the migrated screen via the *existing* `npm run screenshots` sweep compared by eye against `main` (no new baseline infrastructure yet).

---

## Decisions I need from you at Checkpoint 1

1. **Distribution:** 1 (liftable) now, optional 2 later *(recommended)*, or go straight to 2/3?
2. **Tokens:** CSS-first `@theme` with a semantic tier *(recommended)*, or DTCG + Style Dictionary now?
3. **Playground:** Storybook *(recommended)*, Ladle, or extend `/dev/ui`?
4. **Testing:** unit + axe now, visual regression later *(recommended)*, or include screenshots in the slice?
5. **Carnival layer:** separate `@ds/brand` entry *(recommended)*, in the core, or out of the DS?
6. **Naming/location:** `web/src/design-system/` with alias `@ds`, and `docs/design-system/adr/` vs. the repo's existing `docs/adr/` (MADR, numbered, indexed)? The repo's CLAUDE.md says ADRs live in `docs/adr/`; you asked for `docs/design-system/adr/`. I'd follow your request unless you prefer numbered records in `docs/adr/` with a cross-link.
7. **Slice scope:** you asked for Button, Input, FormField. The strongest *drift* screen is a form with raw `<select>` and checkboxes (`MemberForm`: 3 selects, 2 checkboxes; `SeriesForm`; `HistoryForm`), which would pull `Select` and `Checkbox` into the slice. Do you want the slice **kept to the three components with a screen that only needs them (e.g. the public contact form)**, or to **grow it to five components to fix the worst drift** (`MemberForm`)?
