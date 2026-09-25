---
status: accepted
date: 2026-09-25
decision-makers: André Hofer
---

# Give a control an icon only where the icon says one thing

## Context and Problem Statement

`lucide-react` has been a dependency for a long time, and icons appeared on controls one
at a time, each for a local reason. Nothing said which controls get one, so the same
kind of action could be a word on one screen and an icon on the next (#132).

The committee screens are used on phones at 390px. Per-row actions were the tightest
spot, and #118 settled those on its own: the frequent action stays inline and the rest
go behind a "…" menu, because an icon row gives a weekly action and a twice-a-season
delete the same weight (see the docblock in `web/src/components/RowActions.tsx`).

Which controls carry an icon, and which carry nothing but one?

## Considered Options

- Three tiers: icon only, icon and text, text only
- Icons on every action, text kept beside them
- No icons on controls apart from the ones already there

## Decision Outcome

Chosen option: "Three tiers", because an icon saves space only when it replaces the
word, and next to a word it only adds width.

1. Icon only, when the icon means one thing to anybody and the control repeats per
   row beside controls of its own kind: move up and down (`ArrowUp`, `ArrowDown`),
   remove (`Trash2`), close (`X`) and more (`Ellipsis`). The `aria-label` is then the
   control's only name, so it names the row as well as the action ("Monter Repas
   adulte"), comes from both catalogues, and has a test that finds the control by it.
2. Icon and text for a page's create action (`Plus`) and for copying (`Copy`). The
   icon leads, and the words stay.
3. Text only for everything else: the actions in `RowActions` and its menu,
   attendance answers, form submit and cancel, filters and navigation.

Attendance answers stay words on purpose. "Oui" and "Non" are already barely wider than
a 44px square, so an icon would save almost nothing, and a committee member records
those answers on somebody else's behalf, where a misread tap is a wrong record.

### Consequences

- Good, because the option editor's three controls went from 234px of words (73, 93 and
  68px wide) to three 44px squares at 390px, and the remove control now sits at the far
  end, away from the arrows.
- Good, because the create action looks the same on every committee screen.
- Bad, because an icon-only control depends entirely on its `aria-label`, so dropping
  the label leaves the control nameless.

### Confirmation

`web/src/pages/EventRegistrationOptions.test.tsx` finds each icon-only control by the
name that carries its option, and checks that it has no visible text. Removing any one
`aria-label` fails it.

## Pros and Cons of the Options

### Icons on every action, text kept beside them

- Good, because it is one rule with no judgement in it.
- Bad, because every control grows wider, on a phone that has no width to spare.
- Bad, because some actions, "Qui vient ?" and "Ce qu'on réserve" among them, have no
  icon that anybody would read without the words.

### No icons on controls apart from the ones already there

- Good, because nothing changes.
- Bad, because "Monter", "Descendre" and "Retirer" take 234px to say what three familiar
  symbols say in 132px.
