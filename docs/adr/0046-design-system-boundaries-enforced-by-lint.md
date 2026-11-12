---
status: accepted
date: 2026-11-12
decision-makers: André Hofer
---

# Enforce the design system's layers and public API with ESLint and dependency-cruiser

## Context and Problem Statement

A design system is only reusable if it knows nothing about the app: no i18n, no routing, no data fetching, no form libraries, no session, no MSW, no app folder. The vendored components already break this (`FormField` calls `t()`, `toast.tsx` imports i18n, `ButtonLink` wraps the locale router). Before this decision only three lint rules touched imports, and nothing checked layers. ADR 0040 records what happens to a rule only a document states: it drifts back.

What are the layers, what may the design system depend on, and what fails the build when a rule is broken?

## Considered Options

- `eslint-plugin-boundaries` and `dependency-cruiser`, both failing CI
- Only one of the two tools
- TypeScript project references
- The rules written down, without a check

## Decision Outcome

Chosen option: "both tools, both failing CI", because each catches something the other misses, and only a check that fails the build keeps the rules from drifting.

Layers, inner to outer: tokens, primitives, composites, patterns, brand, app. An inner layer never imports an outer one.

- Packages allowed inside `web/src/design-system/`: `react`, `react-dom`, `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, and `sonner` for the toast adapter only.
- The app imports only from `@ds` (later also `@ds/brand`, #409). A deep path into the design system is an error.
- Text, links and data come in as props, through `asChild` and slots, or through render props. Where the app needs behaviour that needs translation, it keeps a thin adapter, as `i18n/routing.tsx` and `notify()` already do. The app's `FormField` is one: it keeps translation and browser validation and renders the design system's `FormField`.
- `eslint-plugin-boundaries` in the flat config checks layer rules, the entry-point rule and the package allow-list, in the editor and in lint-staged.
- `dependency-cruiser` (`npm run lint:boundaries`) checks the same rules plus cycles, as a step of the existing `assets` CI job, which `all-green` already requires.
- The existing guards stay: `no-restricted-imports` for the router and `sonner`, the `size="icon…"` rule, and the node guard tests.

### Consequences

- Good, because the architecture is executable: a leak is a red build.
- Good, because the rule set is the checklist for moving the folder to a package (ADR 0044).
- Bad, because two tools must be configured and kept in agreement.
- Bad, because a flat ESLint config replaces a rule's options wholesale, so the design-system patterns had to be merged into the existing router block instead of added next to it.
- Bad, because the rules for patterns and brand are written only when those layers exist.

### Confirmation

A file that breaks each rule fails both `npm run lint:boundaries` and ESLint. That was shown once when the rules were added, because `eslint-plugin-boundaries` 7 silently checked nothing until `import/resolver` knew the `.ts` and `.tsx` extensions and each layer folder was one element.

## Pros and Cons of the Options

### Only one tool

- Good, because there is less to configure.
- Bad, because ESLint alone gives no cycle check or graph, and dependency-cruiser alone gives no feedback in the editor.

### TypeScript project references

- Bad, because they only mean something once the design system is its own package (#411).

### Rules without a check

- Bad, because ADR 0040 shows such rules drift back.

## More Information

A new CI job was not added: a step in `assets` has the same pass/fail effect without changing `all-green`'s `needs`.
