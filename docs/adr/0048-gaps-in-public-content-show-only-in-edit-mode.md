---
status: accepted
date: 2026-11-14
decision-makers: André Hofer
---

# Show the gaps in the public content only in edit mode

## Context and Problem Statement

The public pages wrote every gap out for everyone to read. An empty photo slot showed
"Photo à venir" with a camera icon (ADR 0028), and a fact the band had not confirmed
showed `<Tbd>`: "••• à compléter" with what is missing (ADR 0038). The reasoning was that
a stale name is worse than an obvious gap, and that counting the gaps by rendering the
pages tells the band what is left before PROD (#106).

The UX review (#401) found that a visitor reads these as an unfinished site. On the mocked
roster, anonymous `/band` showed six "Photo à venir" lines and two "à compléter sur la
page Membres" lines, which are an instruction to an administrator. `/committee` and
`/join` showed the same for the booking number, the joining contacts and an empty
committee (#393). PROD is public, and some of these gaps will outlast the cutover:
photographs are retaken when someone has time, and consent to appear defaults to off.

Who should see a gap in the public content?

## Considered Options

- Everyone, as before
- An editor in edit mode, and nobody else
- Nobody: drop every placeholder
- Everyone, but hide it from visitors with CSS

## Decision Outcome

Chosen option: "An editor in edit mode, and nobody else", because a visitor gets a page
with only real content on it, and the people who can fill a gap still see each one in
the place they fill it.

`useShowsGaps()` in `web/src/content/EditMode.tsx` is true when edit mode is on, which
needs `content.manage`, `images.manage` or `history.manage` and a public page. `Tbd` and
`PhotoPending` render nothing when it is false, so no caller can leak a placeholder. A
caller that wraps a placeholder in an element of its own asks the same hook and drops the
wrapper: a register with no names keeps its heading and loses the line under it, an empty
phone row is left out whole, label included, and the committee's seats render nothing.
An empty photo slot renders nothing for a visitor; in edit mode an editor who may place
photos gets the add frame as before, and one who may not gets the one-line placeholder.

This amends ADR 0028 (what an empty slot shows) and ADR 0038 (what an empty phone row
shows). Neither placeholder is guessed content, so the reasoning against a stale name
still holds: the gap is not filled with anything, it is just not announced.

### Consequences

- Good, because a visitor reads no instruction meant for an administrator and no
  placeholder, in either language.
- Good, because what is missing before PROD (#106) is still counted by rendering the
  public pages, now in edit mode.
- Bad, because a visitor cannot tell "not supplied yet" from "not offered": a register
  with no names, or a contact card with no number, reads as finished. The joining card
  keeps its "En attendant, écrivez-nous" line, which points somewhere useful.
- Bad, because an empty slot now collapses from its reserved frame to nothing once the
  slots have answered, instead of to one line. A placed photo, the normal case, still
  arrives without moving anything.

### Confirmation

`web/e2e/gaps.spec.ts` loads every public page anonymously in French and German and fails
on any `[data-tbd]`, `[data-photo-pending]` or placeholder wording. The Vitest suites of
`Band`, `Committee`, `Join`, `Home`, `RowView`, `PhotoPending` and `SlotPhotoControl` pair
each visitor case with its edit-mode case.

## Pros and Cons of the Options

### Everyone, as before

- Good, because a reader knows a gap is a gap.
- Bad, because a public page reads as unfinished, and two of the gaps are instructions
  to an administrator.

### Nobody: drop every placeholder

- Bad, because the editor loses the only on-page list of what is missing, and an empty
  slot with no placeholder in edit mode is a slot nobody remembers to fill.

### Everyone, but hide it from visitors with CSS

- Bad, because the text stays in the document: a screen reader and a crawler still read
  it, and the hidden element still takes its margins.
