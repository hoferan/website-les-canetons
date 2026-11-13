---
status: accepted
date: 2026-11-11
decision-makers: André Hofer
---

# Give every edit control one action bar, with the main action labelled and the rest behind it

## Context and Problem Statement

In edit mode the page carries its edit controls in four places, each built its own way:

- A single block (a hero, the footer, the home hero) has one floating ✎ chip.
- A card in a grid has a row of floating chips, ← → ✎, in its top-right corner. On a pointer screen, the chip under the pointer widens leftwards and shows its word.
- A history entry has two floating chips, ✎ and 🗑.
- A line inside an editor (a card's rows, a hero's buttons) has ↑ ↓ 🗑 as separate icon buttons.

#360 asked for Dupliquer in the card's editor, and André then asked for Dupliquer and Supprimer on the card itself as well. A fourth chip does not fit. On the home page's band of four tiles, a tile is 237px wide at 1024px and 270px at 1280px. With ⋯ added, ← → ⋯ ✎ and the pencil's word rolled out need 291px, measured in the app, so the row spills over the next tile. Today's three chips fit with about 4px to spare. The German words are longer still: "Nach vorn", "Nach hinten", "Bearbeiten".

André rejected two fixes: showing the words as a small label above the chips, and moving the arrows into the ⋯ menu. He asked for one reusable pattern, so that similar cases look and behave alike, with the actions easy to use.

## Considered Options

- A ticket stub: the list item's top edge is its action bar, and the open segment takes the room its word needs
- A folding group in the corner, where the others give way to the open one
- A drag handle and a menu: ⠿ ⋯ ✎
- Select the card, then a labelled toolbar floating above it
- Words as a label above the chips
- The arrows moved into the ⋯ menu

## Decision Outcome

Chosen option: "a ticket stub", because it is the only one that can never spill. It sits inside the item it acts on, keeps every action one tap away, and shows the main action's word at rest. It came out of two rounds of interactive prototypes at the site's real widths, in French and German, on pointer, touch and keyboard, each round checked by a separate reviewer. André chose it and asked for it as one reusable component for every edit control.

The mock-ups are in [`0043/`](0043/): [`study.html`](0043/study.html) is the interactive prototype, and [`family.html`](0043/family.html) shows the four places and the marker. Once the component is built, its code is the authority.

### One component, three looks

`ActionBar` takes an ordered list of actions, the one that is the main action, and the items of its ⋯ menu. It renders one of three looks:

- `chip`: a floating frame for a single block. In practice it holds only ✎, so it looks as it does today.
- `strip`: a list item's top edge, a yellow strip under the item's top border with a dashed "perforation" below it. Used for cards (← → ⋯ ✎) and history entries (⋯ ✎, since their order is fixed by year).
- `row`: a quiet white bar inside an editor, for a line's ↑ ↓ ⋯.

Every look follows the same rules:

- The main action (✎ Modifier on the page) shows its word at rest. The others show their icon, and their word only while hovered with a fine pointer or focused from the keyboard. They then take the room, and the main action folds to its icon.
- Within one list, every item has the same slots in the same places. A list-level wrapper decides once, from the widest item, whether every word fits. On a phone in French it does, so nothing folds and nothing needs hover. It measures again whenever the list changes width. An end item's missing arrow keeps its slot, dimmed and `aria-disabled`.
- Rarer actions sit behind ⋯: Dupliquer and Supprimer on a card, Supprimer on a history entry. The menu is the same on the page and in the card's editor panel.
- On touch, no word opens on hover. A tap acts at once. Closed segments are 2.5rem on touch and 2rem on a fine pointer, all above the 24px target minimum.
- The bar is a `role="toolbar"` with one Tab stop, the main action first. The arrow keys, Home and End move along it. The focused segment inverts (ink fill, yellow text), so no focus ring has to escape the clipped strip. Keyboard focus wins over hover.
- On a stacked list (one column), the move arrows point up and down.

### Moving an item

A shared hook owns the move rules for cards and for the editor's lines:

- The items slide to their new places, and the moved one pulses once in violet (only an outline under reduced motion).
- Focus stays on the same arrow of the moved item, or on its main action at an end. It shows as keyboard focus only when the move came from the keyboard.
- A live region says "position 2 sur 4".
- After a move, another item's move arrow can end up under the pointer. That arrow ignores clicks until the pointer has left it, so a second click never swaps the items back. On touch, a tap within a second and 30px of the last move is ignored.

### What the page does at once and what the panel keeps

- On the page, Dupliquer saves the copy at once, right after the original, with the undo toast of ADR 0042, and focus goes to the copy's ✎. The copy's name carries its place ("carte 3 sur 5") so a screen reader can tell it from the original.
- In the card's editor panel nothing is stored before Enregistrer. Dupliquer adds an unsaved copy to the form and opens it, and the panel's heading reads « Copie de … ». A line under it says Enregistrer stores the copy and Annuler drops it with every other change.
- Supprimer is the same everywhere. It confirms first, because an undo cannot bring back a deleted card's photo, then saves at once.

### The mark for a text without German

The main action carries a cyan corner flag in its segment's top-left corner when a text of the item has no German, in place of the dot of #359. The flag is 14px, or 12px on a folded tab, and has a 3px ink diagonal. The frame it sits in clips it, so on a chip it follows the chip's curve. An open segment wider than its word starts its content right after the flag, so the flag stays next to the pencil. On a strip the main action starts at the left whether or not it carries the flag, so its word sits in the same place down a column of strips. The accessible name still ends in "(sans allemand)".

André preferred the flag to a dot on the pencil icon and to a cyan hole punched in the perforation, provided it held up everywhere. A separate reviewer then checked it in every look and state: the strip at rest, hovered, folded and focused, in German, on a phone, on a history entry, and the chip on cream, on the yellow band and on the black stage. The flag passed once it was clipped to the chip and sized down.

The ink diagonal carries all of the contrast. Cyan on the bar's yellow is 1.08:1, against 12.8:1 for ink on yellow (WCAG 1.4.11), and under protan and deutan simulation the flag shows only through its ink edge. The diagonal must never go, and the flag must never touch white without ink between them. As with the dot before it, nothing on screen explains what the flag means. Only the accessible name says it.

### Consequences

- Good, because one component carries every edit control, so a new list on the page gets the same bar, rules and keyboard handling for free.
- Good, because nothing can spill: the strip is inside its item, whatever the width or the language.
- Good, because the main action is always labelled, on a phone every word is, and the move rules fix the old swap-back trap of the floating arrows.
- Bad, because cards and history entries grow a strip in edit mode, about as tall as today's room for the chips, and look different from the page a visitor sees.
- Bad, because on a pointer screen a middle card's secondary actions show only their icon until hovered.
- Bad, because the list-level measuring depends on the web font. It must run after the font loads and again on every resize, or a word judged to fit is cut.

### Confirmation

- Component tests for `ActionBar`: the main action labelled at rest, one open segment at a time, keyboard focus over hover, the roving tabindex, dimmed slots and the ⋯ menu's keys.
- Tests for the move hook: focus after a move, the announcement, and the click guard after a pointer move.
- Every look and state on `/dev/ui`, which the screenshot sweep captures at both widths, in French and German.

## Pros and Cons of the Options

### A folding group in the corner

- Good, because it keeps the floating chip's look and has a fixed width.
- Bad, because a fixed width has to fit the longest German word. It spilled by 2px at 1024px, and at rest it left an empty yellow tail.

### A drag handle and a menu

- Good, because dragging is the familiar way to reorder.
- Bad, because the rolled-out words still spilled at 1024px, by 6px in French and 29px in German. It also sends keyboard and screen reader users to the menu for every move, and dragging on a phone needs auto-scroll.

### Select the card, then a labelled toolbar

- Good, because every word is always visible, and its bottom bar on a phone was the best touch layout of the prototypes.
- Bad, because the toolbar jumps when the card moves, so a second click deselects it. It needs room above the card that the page does not have, and a click on the card also hits the links inside it.

### Words as a label above the chips, and the arrows in the ⋯ menu

- Bad, because André rejected both once he saw them rendered on the home band.

## More Information

- ADR 0040 gives the buttons and the roll-up word that the bar's segments reuse. ADR 0042 gives the undo toast. ADR 0029 gives the look.
- #360 (Dupliquer in the editor) is PR #374, which puts Dupliquer and Supprimer in the editor's header menu.
- #379 builds `ActionBar` and the move hook. Then #380 moves the cards onto it, #381 the history entries, #382 the editor's lines and #383 the single blocks' pencils.
