# 0003 · Boundaries: layers, public API, and how they are enforced

Status: accepted, 2026-11-12

## Context

The design system must not know about i18n, routing, data fetching, forms libraries, the session, MSW or any app folder (`02-architecture.md`). Phase 1 found real leaks (`FormField` calls `t()`, `toast.tsx` imports i18n, `ButtonLink` wraps the locale router). Today only three lint rules exist and nothing checks layers.

## Decision

Layers, inner to outer: tokens, primitives, composites, patterns, (brand), app. An inner layer never imports an outer one.

- **Allowed externals inside `design-system/`:** `react`, `react-dom`, `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner` (toast adapter only).
- **Public API:** the app imports only from `@ds` (and later `@ds/brand`). Deep paths are an error.
- **Text, links, data come in as props**, `asChild`/slots and render props. Where the app needs behaviour that needs translation, it keeps a thin **adapter** (precedent: `i18n/routing.tsx`, `notify()`); the slice does this for `FormField`.
- **Enforcement, two independent checks, both in CI:**
  1. `eslint-plugin-boundaries` in the ESLint flat config (layer rules, entry-point rule, external allow-list). Runs in editor and lint-staged.
  2. `dependency-cruiser` (`npm run lint:boundaries`, a step of the existing `assets` job): the same rules, plus cycles. A violation fails the job, which `all-green` already requires.
- Existing guards stay (`no-restricted-imports` for the router and sonner, the `size="icon…"` rule, the node guard tests).

## Alternatives considered

- **Only ESLint** or **only dependency-cruiser.** Each misses something the other catches (re-exports and cycles vs. editor feedback); two tools also teach the difference.
- **TypeScript project references.** Meaningful only once the design system is a package (ADR 0001).
- **Documentation only.** ADR 0040 in the repo records that a rule only a document states drifts back.
- **A new CI job.** Rejected for a step in `assets`: same pass/fail effect, no change to the `all-green` contract.

## Consequences

- Good: the architecture is executable; a leak is a red build.
- Good: the rule set is the checklist for promoting the folder to a package.
- Bad: two tools to configure and keep in agreement.
- Bad: the first version covers primitives and the one composite; patterns and `brand` rules are written when those layers exist.
