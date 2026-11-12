---
status: accepted
date: 2026-11-12
decision-makers: André Hofer
---

# Keep the design system in an in-app module behind `@ds`, without versioning

## Context and Problem Statement

`web/src/components/ui/` holds 13 vendored shadcn components (ADR 0022). Nothing stops one of them from importing i18n, the router or app code, and some do: `toast.tsx` imports i18n, `FormField` calls `t()`, `ButtonLink` wraps the locale-aware router. The UX review (#401) traced several findings to this layer, among them four competing focus-ring mechanisms (#391).

The components need a home with a boundary. The repository has one app, one developer, one deploy, a single root `package.json` with no workspaces, and a build order (SPA, then Laravel) that is already load-bearing. Part of the goal is to learn clean architecture on a real codebase, so the boundary should be real, not just a folder name.

Where does the design system live, how does the app get it, and does it carry a version?

## Considered Options

- An in-app module, `web/src/design-system/`, imported through an alias
- A source-only workspace package (`packages/ui`, consumed as TypeScript)
- A built workspace package with declarations and Changesets
- A separate repository with a published package
- The copy-in registry we have today (shadcn style)

## Decision Outcome

Chosen option: "an in-app module", because it gives the full layering and public API at no release cost, and it can still move to a package later.

- The design system lives in `web/src/design-system/` and the app imports it through `@ds`, its barrel (`index.ts`).
- It has no `@/` imports and knows no app folder, so moving it to `packages/ui` later is a `git mv` plus a manifest (#411).
- It has no version number, no changelog and no Changesets. A change to its public API changes the callers in the same pull request, and the Conventional Commit title records it. A breaking change is therefore free, but it has to be complete: no deprecated alias stays behind.

### Consequences

- Good, because there is no release machinery, refactors stay atomic, and HMR and go-to-definition work as before.
- Good, because the lint rules of ADR 0046 are exactly the checklist for a later move to a package.
- Bad, because TypeScript cannot hide a file inside the app, so the boundary holds only because lint enforces it.
- Bad, because the alias is declared in four places that must agree: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` and `.storybook/vite.config.ts`.
- Bad, because nothing here teaches semantic versioning; that waits for a real second consumer.

### Confirmation

`npm run lint:boundaries` and ESLint fail on an `@/` import inside `web/src/design-system/` and on a deep import from outside it (ADR 0046).

## Pros and Cons of the Options

### A source-only workspace package

- Good, because the boundary is a package boundary, enforced by `exports`.
- Bad, because every glob (Vitest, ESLint, Prettier, Stylelint, the guard tests) has to widen, and Tailwind needs an `@source` line that was not verified for a package outside `web/`. It buys nothing while the app is the only consumer.

### A built workspace package with Changesets

- Good, because it teaches release engineering.
- Bad, because a build step runs before dev, typecheck, test and build in five workflows, with stale-`dist` and duplicate-React risks. Semver is ceremony when the only consumer deploys in the same commit.

### A separate repository

- Bad, because every cross-cutting change becomes two pull requests, and registry authentication is needed in every workflow and in the web-session container.

### The copy-in registry

- Bad, because it is the status quo: no boundary and no public API, which is the problem.

## More Information

Revisit when a second consumer appears: a second app, an e-mail template, Figma variables. Then a package (#411) and versioning come back together. ADR 0045 covers tokens, ADR 0046 the boundary rules, ADR 0047 documentation and tests.
