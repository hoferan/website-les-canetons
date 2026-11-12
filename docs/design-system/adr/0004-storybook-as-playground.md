# 0004 · Storybook is the documentation and playground tool

Status: accepted, 2026-11-12. Reopens the choice in repo ADR 0040, which preferred a hand-kept `/dev/ui` page.

## Context

All variants and states of a component must be documented, kept current, and proven to need no app context. `/dev/ui` renders inside the app's providers, so a component that secretly needs the router or i18n still renders there and the dependency rule is invisible. ADR 0040 listed "a page to keep up to date by hand" as its own cost.

## Decision

Storybook 10 with `@storybook/react-vite`, `@storybook/addon-a11y` and `@storybook/addon-docs`, configured in `.storybook/`. It uses its own minimal Vite config (React, Tailwind plugin, the `@ds` and `@` aliases) so the app's `root: "web"` setup does not leak into it. Stories sit next to components (`*.stories.tsx`) and render with **no providers**: that is the proof of isolation. `/dev/ui` stays until stories cover its content, then is retired through the roadmap.

## Alternatives considered

- **Ladle.** Lighter, same story format, but brings a second Vite and has no a11y panel.
- **Extend `/dev/ui`.** Zero dependencies, but hand-maintained and not isolated.

## Consequences

- Good: props tables and states from the code; a11y panel; stories are reusable as test fixtures.
- Bad: a heavy dev-only dependency tree and another Vite config to keep aligned with the app's.
- Good: `storybook build` runs in the `assets` CI job, so a story that no longer builds fails `all-green`; the type-check also covers stories.
- Bad: a failing story *interaction* (the `play` functions) and the a11y addon are not run in CI yet. They are checked by hand with `npm run storybook`; a test runner is on the roadmap.
