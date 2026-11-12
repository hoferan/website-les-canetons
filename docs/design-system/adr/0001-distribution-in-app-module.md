# 0001 · Distribute the design system as an in-app module, built to be liftable

Status: accepted, 2026-11-12 (decided at Checkpoint 1)

## Context

One app (`web/`), one developer, one deploy. The repo has a single root `package.json`, no workspaces, and a build order (SPA, then Laravel) that is already load-bearing. The app already vendors shadcn components (ADR 0022). The goal of this work is learning clean architecture; see `03-approaches.md` for the five approaches compared.

## Decision

The design system lives in `web/src/design-system/`, imported through the alias `@ds`. It has no `@/` imports of its own, its own barrel (`index.ts`), and no knowledge of any app folder, so it can be moved to `packages/ui` with a `git mv` and a manifest. Promoting it to a source-only workspace package is an optional exercise at Checkpoint 2, not a commitment.

## Alternatives considered

- **Source-only workspace package.** Stronger boundary, but widens every glob (Vitest, ESLint, Prettier, Stylelint, guard tests) and needs a Tailwind `@source` spike for no consumer benefit.
- **Built package, Changesets.** Adds a build step before dev, typecheck, test and build in five workflows. Only honest with a second consumer.
- **Separate repository.** Two PRs per cross-cutting change; registry auth in every workflow and in the web-session container.
- **Copy-in registry.** It is the status quo (ADR 0022): no boundary, no versioned API.

## Consequences

- Good: zero release machinery; atomic refactors; HMR and go-to-definition unchanged.
- Good: the lint rules of ADR 0003 are exactly the checklist for a later move to a package.
- Bad: TypeScript cannot hide a file, so the boundary is lint-enforced only.
- Bad: a fourth place now declares an alias (`tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, and `.storybook/vite.config.ts`).
