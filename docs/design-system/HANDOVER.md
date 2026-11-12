# Handover: Les Canetons design system

Written at **Checkpoint 2**, updated after Phase 6. Read this first, then `00-task-prompt.md` (the original brief and ground rules).
Repo: `hoferan/website-les-canetons`. Branch: **`ccr-dec058aa-1fvzz2`** (pushed; no PR open; do not open one or push to another branch without asking).

## 1. Where we are

| Phase | State | Where |
| --- | --- | --- |
| 1 Current state | done | `01-current-state.md` |
| 2 Architecture | done | `02-architecture.md` |
| 3 Approaches | done | `03-approaches.md` |
| ✋ Checkpoint 1 | answered | see decisions below |
| 4 ADRs | done | `adr/0001`–`0006` + `adr/README.md` |
| 5 Vertical slice | done | code in `web/src/design-system/`, see section 3 |
| ✋ Checkpoint 2 | answered (2026-11-12) | summary in section 5, answers in section 6 |
| 6 Roadmap | done | `04-roadmap.md` |
| Learnings | done | `05-learnings.md` |

Every phase of the brief is done. What happens next is the roadmap's step 0: a PR from this branch, which the user has not asked for yet. Ask before opening it, and ask before creating the six issues proposed in `04-roadmap.md` §6.

## 2. Decisions taken (all recorded as ADRs)

1. **Distribution:** in-app module `web/src/design-system/`, alias `@ds`, built to be liftable (no `@/` imports inside it). Optional later exercise: promote to a source-only workspace package. (ADR 0001)
2. **Tokens:** Tailwind 4 `@theme` CSS is the source of truth, with a semantic tier aliasing the raw palette. DTCG/Style Dictionary deferred until a second consumer exists. (ADR 0002)
3. **Boundaries:** layers tokens → primitives → composites → patterns → app; public API is the `@ds` barrel; enforced by ESLint and dependency-cruiser. (ADR 0003)
4. **Playground:** Storybook 10, stories render with no providers. (ADR 0004)
5. **Testing:** Vitest + Testing Library + axe in jsdom now; visual regression later (Windows vs Linux baseline problem). (ADR 0005)
6. **Versioning:** none while there is one consumer. (ADR 0006)
7. **Decided by "go with your recommendations":** carnival decoration (`Scallop`, `Confetti`, `PageHero`) goes in a *future* `@ds/brand` entry (not built yet); ADRs live in `docs/design-system/adr/` (not the repo's `docs/adr/`); slice scope = Button, Input, FormField.
8. **Not Tailwind-free, not StyleX.** Discussed and rejected for this repo (rewrite cost, vendored shadcn layer is Tailwind-only, drift is a component problem not an engine problem). Typed token names could be generated from `tokens.css` later.

## 3. What exists in code

```text
web/src/design-system/
  index.ts                      public barrel (what the app may import via "@ds")
  tokens/tokens.css             semantic tokens, imported by web/src/styles.css
  internal/cn.ts                tailwind-merge helper that knows the radius/shadow tokens
  internal/testing/axe.ts       expectNoA11yViolations (contrast rule off in jsdom)
  primitives/button/            Button (+ loading state), tests, stories
  primitives/input/             Input, tests, stories
  composites/form-field/        FormField (render-prop control wiring), RequiredMark, tests, stories
.storybook/                     main.ts, preview.ts, vite.config.ts (own Vite config)
.dependency-cruiser.cjs         boundary rules (layers, allow-list, barrel-only, cycles)
```

Related changes outside that folder:

- `@ds` alias in `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.storybook/vite.config.ts` (**four places that must agree**).
- `web/src/components/FormField.tsx` is now an **app adapter** over the design-system `FormField` (keeps `useBrowserProblem`, `formIsValid`, password toggle, textarea, `RequiredLegend`, `FormError`; re-exports `RequiredMark`). Its ~28 callers are unchanged.
- ~75 files had `@/components/ui/button|input` rewritten to `@ds`.
- `eslint.config.js`: boundaries block, `DS_DEEP_IMPORT` pattern folded into the router `no-restricted-imports` block.
- `package.json`: scripts `storybook`, `build:storybook`, `lint:boundaries` (also in `check`); dev deps storybook 10.6.7 (+ react-vite, addon-a11y, addon-docs), `eslint-plugin-boundaries` 7.4.2, `dependency-cruiser` 18.7.2, `axe-core`.
- `.github/workflows/ci.yml`: steps "Design-system boundaries" and "Storybook build" in the existing `assets` job (so `all-green` is unchanged).
- `pages/Contact.tsx`: submit button uses `loading={send.isPending}` (#394).
- `styles.css`: imports `tokens.css`; `focus-ring` / `focus-ring-stage` utilities now read `--color-focus` / `--color-focus-stage`.

Semantic token naming: `--color-action*`, `--color-content*` (not `text`: `--color-muted` already exists as shadcn's cream page ground, so `text-muted` would paint cream), `--color-focus`, `--color-feedback-error`, `--radius-control`, `--radius-button`. Only tokens a component uses were added.

## 4. How to run and verify

```bash
npm ci --ignore-scripts          # then the commands below
npm run typecheck && npm run lint:js && npm run lint:boundaries && npm run lint:css && npm run format:check
npm run test:web                 # 1602 tests
npm run test:js                  # 249 node guard tests (tools/*.test.mjs)
npm run storybook                # playground on :6006
npm run build:storybook          # CI also runs this
npx vite build                   # SPA build; npm run build:preview -- <pr> for a PR preview build
npm run test:e2e                 # needs Chromium; see traps
```

Everything above was green at the last push. Not run in this session: `npm run build` (assembles Laravel too, needs PHP/composer), the FTP deploy itself, `lint:api`/`test:api`.

## 5. Checkpoint 2 summary (what the user already saw)

**Verified:** pixel diff of home, login and contact against `main` at 1280 and 390 px: default states identical. Only two intentional differences: (a) one solid `focus-ring` replaces the 2.5:1 translucent ring on Button and Input (#391); (b) the focused first invalid field now shows its focus ring (on `main` it was red on red, i.e. invisible). axe incl. contrast: 0 violations on 22 stories in Chromium. Negative tests: a file breaking each ESLint/dependency-cruiser rule fails (those temporary files were deleted, so they are **not** in the repo).

**Friction:** `eslint-plugin-boundaries` v7 checked nothing until `import/resolver` got `.ts/.tsx` extensions and each layer folder became one element; flat ESLint config replaces a rule's options wholesale, so patterns had to be merged into the existing router block; tailwind-merge needed the new radius names (hence the DS's own `cn`); the `@ds` alias is declared in four places.

**What I'd change before scaling:**
1. Replace Button's `surface` prop (and its compound variants) with a scoped `[data-surface="stage"]` token override (needs the shadow colour/offset split out of the shadow tokens).
2. Next primitives: `Select`, `Textarea`, `Checkbox` (six cloned selects, eight raw checkboxes, the cause of #390; the adapter still hand-writes the textarea).
3. A guard test that fails on raw `<select>`/`type="checkbox"` once those exist.
4. Run story `play` functions and the a11y addon in CI (today stories only build).
5. Add `@ds/brand` only when needed; retire `/dev/ui` once stories cover it.

## 6. Checkpoint 2 questions and the user's answers

1. Go ahead with Phase 6, mapped to UX milestone issues #385 to #401? Yes. No GitHub issues created; the roadmap only proposes them.
2. Promote `design-system/` to a source-only workspace package now, or later? Later: roadmap step 7.3, optional.
3. Is Contact the right "migrated screen"? Keep Contact. MemberForm is the next one, verified once Select and Checkbox exist (roadmap step 3.4).
4. Roll `loading` out to the other forms? Yes, as a roadmap step (2.3 under #394), not on this branch.

## 7. Roadmap hints for Phase 6

Superseded by `04-roadmap.md`, which follows them except in one place: #397 (button sizes) moves forward to step 1.2, so the Button template is fixed before new primitives copy it. Kept for the record.

- Order (primitives first): Checkbox (#390), Select, Textarea, Badge (#385), Surface (#386, resolve 18 vs 20 px radius), StateMessage (#387, builds on `Notice`; merges `text-red-700` ×3 and `text-gray-600` into `--color-feedback-*`), adopt StateMessage (#388), token scales (#398), button size cleanup (#397: `h-*` classes are dead because `min-h-touch` wins), then app-level refactors (`ButtonLink` → `Button asChild`, toast `closeLabel`, `Highlighted`/`social.tsx` leaks).
- Issues mapped to DS work: #385, #386, #387, #388, #390, #391 (done in slice), #394 (partly: Button `loading`), #397, #398, #400. Not DS work: #389, #392, #393, #395, #396, #399.
- The review's draft numbers 001–016 map to real issues #385–#401 (see `01-current-state.md` §6).
- Propose new issues only for gaps: `Select`, `Textarea` (not in the review).
- Estimates go in `04-roadmap.md`; `05-learnings.md` last.

## 8. Traps and gotchas learned

- **Repo rules (CLAUDE.md):** everything in English; Conventional Commits; PR title is a Conventional Commit; `main` takes PRs only; plans/specs normally go in gitignored `docs/superpowers/` (the user explicitly asked for `docs/design-system/`, so those are committed). A new CI job must be added to `all-green`'s `needs`; adding a step to an existing job avoids that.
- **Commit trailers:** end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line from the session attribution reminder if present.
- **`rg` without a path** reads stdin and hangs in a non-tty shell; always pass a path (`rg pattern .`).
- **Quote globs** passed to `rg` in shell variables (use an array); an unquoted `*.tsx` expands in the cwd.
- **Prettier** config applies to `web/**` only; `eslint.config.js` uses single quotes, so format it with `prettier --single-quote --print-width 100` or you rewrite the whole file.
- **Playwright/Chromium in the cloud container:** the repo's Playwright expects a different build than `/opt/pw-browsers`. Use `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npx playwright test …` (the config supports this variable). For ad-hoc scripts launch with `executablePath` and `--no-sandbox`, and use `browser.newContext()` before `AxeBuilder`.
- **Visual comparison against `main` via a git worktree:** a symlinked `node_modules` makes Vite refuse to serve fonts outside its root, so headings render in Karla and *every* pixel differs. Run the baseline server with a wrapper config that merges `server.fs.strict = false`, and always screenshot `main` against itself first to measure noise. Use `reducedMotion: "reduce"` and wait for `document.fonts.ready`.
- **Docs hosts are blocked** in the container (tailwindcss.com, designtokens.org). Not verified: DTCG's current status. Tailwind scanning of design-system source in `web/src` *is* verified (builds generate the classes). Only the package approaches (2–4) still need an `@source` spike.
- **No `.nvmrc`** in this repo; Node 22 was used. dependency-cruiser needs Node ≥ 22.
- The pixel-diff and axe-over-stories scripts were scratch files and are not in the repo. Method: build Storybook, serve `dist/storybook`, read `index.json`, open `iframe.html?id=<story>` per story, run `@axe-core/playwright` with WCAG tags; for screenshots, run both servers (`vite --mode mock`), shoot home/login/contact (default, errors, focus) at 1280 and 390, diff with PIL.

## 9. Suggested prompt to resume

> Read `docs/design-system/HANDOVER.md` and `04-roadmap.md` on branch `ccr-dec058aa-1fvzz2` of `hoferan/website-les-canetons`. Start roadmap step <n>.

For step 0 that means opening the PR from this branch, titled as a Conventional Commit, with the body from `.github/PULL_REQUEST_TEMPLATE.md` and the pixel diff as evidence.
