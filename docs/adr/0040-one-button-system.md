---
status: accepted
date: 2026-11-05
decision-makers: André Hofer
---

# Build every button from one system of role variants and three components

## Context and Problem Statement

In a hands-on review of #339, André found that each screen chose its own button look, its own cursor and its own footer layout (#344). Primary actions were violet on one screen and yellow on the next. Some buttons showed a pointer and some did not. Save sat on the right in one dialog and on the left in another, and an icon-only button gave no hint of what it did. ADR 0025 decided where an icon goes and ADR 0029 gave the framed look, but neither said which variant means what, where the footer buttons go, or how an icon-only button names itself.

Which rules make a button look and behave the same on every screen, and how does the next screen get them without anyone remembering them?

## Considered Options

- Role variants plus three components (`Button`, `IconButton`, `FormActions`), guarded by lint and tests, and a dev-only catalogue page
- Documentation only: a style guide that says what to use
- Aliases: keep the existing variants and add wrapper names for the roles
- The same system, with Storybook instead of the catalogue page

## Decision Outcome

Chosen option: "Role variants plus three components", because a rule that only a document states drifts back within a few screens, while a variant named by role and a footer component leave a screen no way to choose its own look.

André picked each point below from a rendered mockup at 1280px and at 390px.

- Five variants named by role live in `web/src/components/ui/button.tsx`: `primary`, `secondary`, `danger`, `quiet` and `accent`. Yellow stays for the public call to action and for edit tools, so `accent` never sits in a form footer. `quiet` has no frame and serves an icon inside a field or a link in a sentence. `danger` marks the final confirm of something irreversible, and it also marks a selected "No" answer, as in `AttendanceControls` and `CorrectAnswerDialog`, where it is a state colour.
- A `surface` of `page` or `stage`. The page is cream and the stage is black, where an ink shadow would vanish, so on the stage the shadow and the focus ring turn pink.
- One shape. Framed buttons have 12px corners and no size sets a radius of its own.
- A pressed-in press. A framed button moves onto its shadow when pressed, and the stage's pink shadow does the same. A `quiet` button has no shadow, so its underline takes that part: the word drops 3px onto the line while the line and a grey patch behind it stay put. André picked this from six mocked presses. Every button shows a pointer cursor.
- `IconButton` is the only way to render an icon-only button. In `tip` mode, for icons in rows, the name appears as a small ink label above the button, in a Radix tooltip in a portal so a scrolling dialog or a clipped card cannot cut it off. It opens on hover and on focus moved by Tab or an arrow key, and not after a mouse click. In `grow` mode, for the edit chips, the button widens in place and the name rises into it, from the `sm` breakpoint up. Touch shows no name, since a tap is not a hover.
- `FormActions` is the one footer for every form and dialog, through `DialogFooter` and `AlertDialogFooter`. Save comes first and sits on the left. On a phone the buttons stack full width with Save on top. A quiet action goes to the far end from `sm`. The caller orders the buttons: confirm, then Cancel, then the quiet one.
- A dev-only catalogue at `/dev/ui`, mounted only in development, shows every variant, size, surface and state side by side.

### Consequences

- Good, because a button's meaning is its variant, so a reviewer sees a wrong choice in one word.
- Good, because an icon-only button always shows its name, which a keyboard user and a mouse user both get.
- Good, because the catalogue puts every state on one page that the screenshot sweep captures at both widths.
- Bad, because the `size="icon…"` sizes still exist in `button.tsx` for `IconButton` to use, and only the lint rule stops a screen from using them directly.
- Bad, because the catalogue is a page to keep up to date by hand, where Storybook would document the props from the code.

### Confirmation

- The ESLint rule in `eslint.config.js` bans `size="icon…"` on JSX, so an icon-only `Button` fails the lint.
- `tools/form-actions.test.mjs` fails a file with a submit button that uses no footer component, a footer that holds an `accent` button, and a confirm dialog footer that lists Cancel first.
- `web/src/components/ui/button.test.tsx` and `web/src/components/ui/icon-button.test.tsx` pin the pointer cursor, the 12px corners, the press and when the tip opens. `web/e2e/quiet-press.spec.ts` measures the quiet press in a browser.
- `/dev/ui` is in `web/screenshots/pages.json`, and a test requires every page route to be listed there, so the catalogue is rendered in every screenshot sweep.

## Pros and Cons of the Options

### Documentation only

- Good, because it costs nothing to write.
- Bad, because nothing fails when a screen ignores it, and the review of #339 found exactly that drift.

### Aliases

- Good, because no existing call site changes at once.
- Bad, because the old names stay available, so a screen can still pick a look the roles do not name.

### Storybook

- Good, because it documents the props from the code and supports visual-regression tooling.
- Bad, because it adds a second build, its own configuration and a dependency tree to maintain for a project with one developer and a handful of components. The dev-only page gives the same side-by-side view with nothing new to install.

## More Information

- ADR 0025 decides which controls carry an icon, and ADR 0029 gives the framed look. This record amends both: it names what each variant means, and it sets 12px corners and a press onto the shadow on the raised buttons that ADR 0029 introduced.
- Revisit Storybook if a designer joins, if more people build screens, or if automatic visual-regression checks are wanted.
