---
status: accepted
date: 2026-09-25
decision-makers: André Hofer
---

# Store user-typed content in both languages, and fall back per entry

## Context and Problem Statement

The band's history (#104) is the first text in the app that the committee types
rather than a developer. Until now every string on screen was a key in
`web/src/i18n/fr.ts` and `web/src/i18n/de.ts`, so a second language cost one
catalogue file. User-typed text is content: it renders verbatim, and no catalogue
reaches it.

The issue was written when the site was French only, and accepted that a later
German locale could not translate the history. German shipped on 2026-09-21, so
`/de/history` exists and has to show something.

How should user-typed content be stored and shown on a site with two languages?

## Considered Options

- Both languages stored, neither required, falling back per entry
- French only, shown verbatim on both pages
- Both languages required

## Decision Outcome

Chosen option: "Both languages stored, neither required, falling back per entry",
because it lets the committee write in whichever language they have, and a German
page still gets German wherever somebody wrote it.

Each history entry has a French title and text and a German title and text. Any of
the four may be empty, but not all of them. A page shows an entry in its own
language when the entry has a title or a text in it, and otherwise in the other
language, marked with `lang` and a short note saying which language it is in.

The language is chosen per entry, never per field, so a French title never sits
over a German text.

Later user-typed content follows the same pattern, and so will the register and
role labels when their editor is built.

### Consequences

- Good, because a German reader sees German wherever it exists, and never an empty
  entry.
- Good, because the committee is never made to write a text twice before it can
  save.
- Bad, because every editor for such content carries two sets of fields.
- Bad, because a German page can show French, or a French page German, until
  somebody translates the entry.

### Confirmation

`api/tests/Feature/HistoryEntryTest.php` accepts each text field on its own and
refuses an entry whose four fields are empty or blank. `web/src/history/entry.test.ts`
covers every row of the fallback: both languages, French only, German only, and a
French title with a German text.

## Pros and Cons of the Options

### French only, shown verbatim on both pages

- Good, because the editor has half the fields.
- Bad, because the German page shows French for good, with nothing the committee
  can do about it.

### Both languages required

- Good, because every page is always in its own language.
- Bad, because an entry cannot be saved until somebody has translated it, and a
  one-line note becomes two.
