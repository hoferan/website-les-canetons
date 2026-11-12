---
status: accepted
date: 2026-11-12
decision-makers: André Hofer
---

# Keep design tokens in Tailwind's CSS, with a semantic tier over the palette

## Context and Problem Statement

The tokens live in the `@theme` block of `web/src/styles.css` (ADR 0022) and are used with discipline: about 467 brand-token class uses against 4 off-palette colours. They are flat, though. Names are hues (`violet`, `danger`), so the role a colour plays lives in a comment. There are no scales for radius, type size, z-index or motion, and the focus indicator comes from four mechanisms, one of them a 2.5:1 ring (#391).

There is one consumer, the SPA, on one platform.

What is the source of truth for tokens, and how do components refer to them?

## Considered Options

- Tailwind 4 `@theme` CSS as the source, with semantic tokens aliasing the raw palette
- DTCG JSON as the source, with Style Dictionary generating the CSS
- Renaming every raw token to a semantic one in a single sweep

## Decision Outcome

Chosen option: "Tailwind 4 `@theme` CSS with a semantic tier", because it needs no build step and Tailwind already generates utilities from it, while the alias structure keeps a later move to DTCG mechanical.

1. Semantic tokens are written in `web/src/design-system/tokens/tokens.css`, which `styles.css` imports.
2. Raw tokens (`--color-violet`) stay in `styles.css` for brand and decoration. Semantic tokens (`--color-action`, `--color-border`, `--color-feedback-error`, `--color-focus`, `--radius-control`, `--radius-button`) alias them, and design-system components use only those.
3. A semantic token is added when a component needs it, not ahead of time.
4. Names follow DTCG's groups and aliasing, so converting to DTCG JSON is a one-to-one mapping.
5. A token that a theme or surface may override is not declared `@theme inline`, because inlining freezes the reference.
6. Text colours are `--color-content*`, not `--color-text*`. shadcn's `--color-muted` already exists as the cream page ground, so `text-muted` would paint cream text.

### Consequences

- Good, because there is no build step and Tailwind generates `bg-action`, `border-border` and the rest from the tokens.
- Good, because one focus token behind one utility fixes the root cause of #391.
- Bad, because two vocabularies (brand and semantic) live side by side until the screens migrate, and no lint rule narrows that yet.

### Confirmation

Components are reviewed against `tokens.css`. The scan in #398 will fail on a computed value outside the documented scales.

## Pros and Cons of the Options

### DTCG JSON with Style Dictionary

- Good, because one source can feed CSS, Figma variables and native platforms.
- Bad, because there is no second platform, and it puts a generated file in the critical path of `dev` and `build`.

### Rename everything in one sweep

- Bad, because it touches about 467 call sites with no visual-regression baseline. Migrating with each component is safer.

## More Information

Revisit when a second consumer needs the values (#412): Figma variables, an e-mail template, or the ADR mock-up HTML files that copy colours by hand. Typed token names could then be generated from the same source.
