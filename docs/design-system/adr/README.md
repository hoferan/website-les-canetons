# Design-system ADRs

Format: Context, Decision, Alternatives considered, Consequences (plus a status line).
They live here, next to the design-system docs, because that is where this learning project asked for them.
The repository's own architecture decisions are in `docs/adr/`; each record below links back to the repo ADR it builds on.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-distribution-in-app-module.md) | Distribute the design system as an in-app module, built to be liftable | accepted |
| [0002](0002-tokens-css-first-with-semantic-tier.md) | Tokens: Tailwind 4 `@theme` CSS is the source, with a semantic tier | accepted |
| [0003](0003-boundaries-and-enforcement.md) | Boundaries: layers, public API, and how they are enforced | accepted |
| [0004](0004-storybook-as-playground.md) | Storybook is the documentation and playground tool | accepted |
| [0005](0005-testing-strategy.md) | Testing: unit + axe now, visual regression later | accepted |
| [0006](0006-no-versioning-for-now.md) | No versioning while there is one consumer | accepted |
