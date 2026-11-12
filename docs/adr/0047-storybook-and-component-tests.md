---
status: accepted
date: 2026-11-12
decision-makers: André Hofer
---

# Document components in Storybook, test them with Vitest and axe, and add visual regression later

## Context and Problem Statement

Every variant and state of a design-system component has to be shown, kept current, and proven to need no app context. `/dev/ui` renders inside the app's providers, so a component that secretly needs the router or i18n still renders there, and the dependency rule (ADR 0046) stays invisible. ADR 0040 chose `/dev/ui` over Storybook and listed keeping it current by hand as its own cost.

On the testing side, jsdom has no layout and no contrast, and the carnival look is pixel-defined. Screenshot baselines drawn on a Windows machine differ from those in Linux CI.

Which tool documents components, and what proves they work?

## Considered Options

- Storybook 10, with unit and axe tests in Vitest, and visual regression later
- Ladle
- An extended `/dev/ui`
- Visual regression (`toHaveScreenshot`) from the start

## Decision Outcome

Chosen option: "Storybook 10, unit and axe tests in Vitest, visual regression later", because a story without providers proves isolation, and the tests that run in jsdom cover the component contract without a new baseline infrastructure.

- Storybook 10 with `@storybook/react-vite`, `@storybook/addon-a11y` and `@storybook/addon-docs`, configured in `.storybook/` with its own small Vite config (React, the Tailwind plugin, the `@ds` and `@` aliases). Stories sit next to their component and render with no providers.
- Per component, Vitest and Testing Library cover role and name, `ref` and `className` forwarding, variants, keyboard, disabled and loading states, and ARIA wiring. `axe-core` runs in jsdom for structure, with the contrast rule off because jsdom cannot compute it.
- Real contrast and layout stay with the Playwright axe sweep (`web/e2e/a11y.spec.ts`) and the Storybook a11y panel.
- `/dev/ui` stays until stories cover all of it, then goes (#408).
- Visual regression waits (#410). When it comes, baselines are generated and compared only in Linux CI.

This amends ADR 0040's choice of a hand-kept catalogue page for design-system components.

### Consequences

- Good, because props tables and states come from the code, the a11y panel checks each state, and stories can serve as test fixtures.
- Good, because the tests run in `npm run check` and need no baseline infrastructure.
- Good, because `storybook build` runs in the `assets` CI job, so a story that no longer builds, or one that imports app code, fails `all-green`.
- Bad, because Storybook is a heavy dev-only dependency tree with a second Vite config to keep aligned.
- Bad, because story `play` functions and the a11y addon do not run in CI yet (#404); they are checked by hand with `npm run storybook`.
- Bad, because a pure style regression, a changed radius say, is not caught automatically until visual tests exist.

### Confirmation

The `assets` job runs `npm run build:storybook`. Each component's test file calls `expectNoA11yViolations` for every state.

## Pros and Cons of the Options

### Ladle

- Good, because it is lighter and uses the same story format.
- Bad, because it ships its own Vite and has no a11y panel.

### An extended `/dev/ui`

- Good, because it adds no dependency and is already in the screenshot sweep.
- Bad, because it is kept current by hand and renders inside the app's providers, so it cannot show that a component is isolated.

### Visual regression from the start

- Bad, because cross-OS baseline differences would make it flaky, for three components.
