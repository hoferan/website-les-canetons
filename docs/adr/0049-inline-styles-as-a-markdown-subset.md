---
status: accepted
date: 2026-11-23
decision-makers: André Hofer
---

# Store bold and italic in block texts as a Markdown subset

## Context and Problem Statement

The texts of a public page's blocks (ADR 0038) were plain. The Direction could not set a
word of the home hero's intro or of a card in bold, and the only styling on the public
pages was the hero title's highlight, picked word by word (#372).

A block stores each text as a `{ fr, de? }` pair of strings. The server checks a block's
size and nesting, never its shape, and the export bundle (ADR 0039) and the German
fallback both work on those strings as they are. The block editor shows the page beside
it while it is open (#357), so the Direction already sees the result of a change as it
is typed.

How should a text carry bold and italic, and how does the Direction apply them?

## Considered Options

- `**bold**` and `*italic*` inside the existing strings, applied with a B / I bar on the
  native textarea
- The same strings, edited in a rich text field (Tiptap or similar)
- Structured runs in the block JSON, such as `[{ text, bold, italic }]`
- HTML in the strings, cleaned by a sanitiser

## Decision Outcome

Chosen option: "`**bold**` and `*italic*` inside the existing strings, applied with a B / I
bar on the native textarea", because nothing outside the SPA changes and nothing new is
installed. A Direction member with no Markdown knowledge still gets bold from a button,
and sees it on the page beside the field.

- Only two styles: `**bold**` and `*italic*`, which may nest. No links, no escapes, no
  other Markdown. Titles keep their highlight and take neither.
- A pair never spans a line, and a star that closes nothing stays a star. A text typed
  before this, such as "5 * 3", reads as it always did.
- A run of two or four stars that pairs with nothing is dropped on save. It is what B
  or I puts down at a caret, left empty, and saved it would show as stars or keep a
  blank German text from falling back to French.
- The page renders the pairs as `<strong>` and `<em>` React elements
  (`web/src/content/StyledText.tsx`). No HTML string is built, so there is no
  `dangerouslySetInnerHTML` and no sanitiser.
- The styled texts are the hero's intro, the footer's pitch, a card's text rows and a
  label/value row's value.
- B and I sit in a bar on top of each of those textareas, French and German, and
  Ctrl+B and Ctrl+I in the field do the same. The field keeps showing the stars.

### Consequences

- Good, because the server, the export bundle, the block schemas and the German
  fallback are untouched, and no stored text needs migrating.
- Good, because the parser is small enough to ship to every visitor
  (`web/src/content/inlineStyles.ts`).
- Bad, because the field shows `**` around the bold words, and the Direction reads the
  result on the page beside it.
- Bad, because a text that holds a star pair on purpose, such as `*note*`, now renders
  in italic. None of the shipped texts does.
- Bad, because a `**` typed on its own on purpose, as in "5 ** 2", is dropped on save.

### Confirmation

`inlineStyles.test.ts` pins the matching rules, the stray star included.
`toggleStyle.test.ts` pins what B and I do to a selection. `web/e2e/edit-blocks.spec.ts`
sets a word of the home hero in bold in French and German in a real browser, and checks
that Ctrl+Z takes the stars back off.

## Pros and Cons of the Options

### A rich text field

- Good, because the field itself shows bold, with no stars.
- Bad, because it adds a dependency of 60 to 100 KB that has to be lazy-loaded, a
  Markdown round trip that must keep line breaks and stray stars exactly, and
  contenteditable on Android keyboards, all to repeat what the page beside the field
  already shows.

### Structured runs in the block JSON

- Good, because no text can be misread as a style.
- Bad, because every block schema, the export bundle and the German fallback would
  change shape, and every stored text would need migrating.

### HTML in the strings

- Good, because it renders with no parser.
- Bad, because it needs a sanitiser on every read and `dangerouslySetInnerHTML` on the
  page, for two styles.

## More Information

Issue #372. A link inside a text was left out on purpose: a card can be a link itself
(ADR 0038), and a link inside a link is invalid. Adding one later is a new decision.
