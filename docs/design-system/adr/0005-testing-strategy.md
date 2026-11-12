# 0005 · Testing: unit + axe now, visual regression later

Status: accepted, 2026-11-12

## Context

jsdom has no layout and no contrast. The carnival look is pixel-defined, but baselines drawn on a Windows machine differ from Linux CI.

## Decision

Per component: Vitest + Testing Library for the contract (role and name, `ref` and `className` forwarding, variants, keyboard, disabled/loading, ARIA wiring) and `axe-core` in jsdom for structure (contrast rule off in jsdom). Real contrast and layout stay with the existing Playwright axe sweep (`web/e2e/a11y.spec.ts`) and the Storybook a11y panel. Visual regression is deferred: the migrated screen is compared against `main` through the existing `npm run screenshots` sweep. If added later, baselines are generated and compared only in Linux CI.

## Alternatives considered

- **Storybook test runner / Vitest addon now.** Good fit later; not needed to prove the slice.
- **`toHaveScreenshot` now.** Cross-OS flakiness outweighs the benefit for three components.

## Consequences

- Good: fast, in `npm run check`; no new baseline infrastructure.
- Bad: a pure style regression (a radius changed) is not caught automatically until visual tests exist.
