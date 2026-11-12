# 0002 · Tokens: Tailwind 4 `@theme` CSS is the source, with a semantic tier

Status: accepted, 2026-11-12

## Context

Tokens already live in the `@theme` block of `web/src/styles.css` (ADR 0022). They are almost always used correctly (467 brand-token uses against 4 off-palette) but are flat: hue names (`violet`, `danger`), no roles, no scales for radius, type, z-index or motion, and four competing focus-ring mechanisms. There is one consumer (the SPA) on one platform.

## Decision

1. **Keep CSS as the source of truth.** Tokens are written in `web/src/design-system/tokens/tokens.css`, imported by `styles.css`.
2. **Two tiers.** Raw tokens (`--color-violet`) stay in `styles.css` for brand and decoration. **Semantic tokens** (`--color-action`, `--color-border`, `--color-feedback-error`, `--color-focus`, `--radius-control`, `--radius-button`) alias them and are what design-system components use.
3. **Semantic tokens are added only when a component uses them**; the rest of the proposal in `02-architecture.md` waits for its component.
4. Names follow DTCG group naming and aliasing, so a conversion to DTCG JSON is mechanical.
5. Tokens that must be theme-able are not declared `@theme inline`.

## Alternatives considered

- **DTCG JSON + Style Dictionary 5.** Fan-out to other platforms is the benefit; there is none today. It would add a generated file to the critical path of `dev` and `build`.
- **Rename raw tokens to semantic ones in one sweep.** 467 call sites, no visual-regression baseline. Rejected; migrate with the components.
- **Typed token names in TypeScript.** Possible later by generating a union from the CSS.

## Consequences

- Good: no build step; Tailwind generates utilities from semantic tokens (`bg-action`, `border-border`).
- Good: one focus token fixes the root cause of #391.
- Bad: two vocabularies coexist (brand and semantic) until migration finishes; the lint rule that narrows this is future work.
- Revisit when a second consumer needs the values (Figma variables, mock-up HTML, native).
