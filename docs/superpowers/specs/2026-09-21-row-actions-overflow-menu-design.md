# Per-row actions behind an overflow menu

Design for [#118](https://github.com/hoferan/website-les-canetons/issues/118),
the leftover from [#89](https://github.com/hoferan/website-les-canetons/issues/89):
the action row wraps now, which was the fix, and wrapping is still not good.
Decided 2026-09-21.

## What was re-measured, because the issue predates #146

The issue was written before the card became the only layout, and two of its
three complaints have moved. Measured on the mocked stack at a 390px viewport
as `demo.direction`, who holds `events.manage`, `attendance.view_all` and
`registrations.view` at once and therefore sees the widest row there is:

| Screen                  | buttons | lines | action row | card  | share of card |
| ----------------------- | ------- | ----- | ---------- | ----- | ------------- |
| `/events`, a rehearsal  | 4       | 2     | 96px       | 294px | 33%           |
| `/events`, the souper   | 5       | 3     | **148px**  | 388px | 38%           |
| `/members`              | 3       | **1** | 44px       | 206px | 21%           |

`document.scrollWidth - document.clientWidth` is 0 on all three, so #89's fix
holds.

**The roster no longer piles.** The issue describes `Modifier` and
`Mot de passe` on one line with a red `Supprimer` alone on the next; #146 made
the cards wider and all three now fit on one 44px line. The ragged pile is a
planning problem only.

The other two complaints survive untouched. `Supprimer` is still
`variant="destructive"` on the roster and `variant="outline"` on the planning,
the same action in two treatments. And the frequencies are still nowhere near
equal: `Qui vient ?` is opened every week, `Supprimer` a handful of times a
season, and they are the same button.

Button widths, against 326px of usable card:

| `Qui vient ?` | `Inscriptions` | `Ce qu'on réserve` | `Modifier` | `Supprimer` |
| ------------- | -------------- | ------------------ | ---------- | ----------- |
| 103px         | 113px          | 140px              | 88px       | 103px       |

## Why the menu, when two cheaper options existed

The issue records three options and decides none. Each was built as real DOM in
the running app at 390px and measured, rather than argued about.

**A deliberate stack below `md` is worse than the pile it replaces.** Five
full-width buttons are 5 x 44 + 4 x 8 = **252px**, against today's 148px. That
is not a close call and it removes the option.

**Icons and the menu are pixel-identical.** Both land on one 44px line and take
the souper's card from 388px to 284px. So the choice was never about space:

| Variant                           | lines | row  | card  |
| --------------------------------- | ----- | ---- | ----- |
| today                             | 3     | 148px | 388px |
| one label + four icon buttons     | 1     | 44px | 284px |
| five icon buttons                 | 1     | 44px | 284px |
| one label + an overflow menu      | 1     | 44px | 284px |

André chose the menu over the icons on 2026-09-21, having looked at all three:
it is the general solution, and it is the only one that answers the frequency
mismatch rather than compressing it. Five identical 44px squares put the weekly
action and the twice-a-season one at the same weight, which is the complaint.
The menu also owes nothing to a glyph vocabulary — the icons needed one for
`Inscriptions` (the guest list) and one for `Ce qu'on réserve` (the menu
options), two confusable things at 20px, and that vocabulary was a guess.

## What the menu costs, which is less than the issue assumed

The issue says `web/src/components/ui/` has no menu primitive, "so this is a
vendored `dropdown-menu` and its keyboard and focus behaviour, not a class
change". The first half is right and the dependency half is not:
`radix-ui` ^1.6.7 is already a direct dependency, `ui/alert-dialog.tsx` already
vendors from it, and `@radix-ui/react-dropdown-menu` is already installed as
one of its transitives. **No new package.** What remains is the keyboard and
focus behaviour, which is the real work and is §3 below.

## 1. The primitive

`web/src/components/ui/dropdown-menu.tsx`, vendored from `radix-ui`'s
`DropdownMenu` exactly as `alert-dialog.tsx` vendors `AlertDialog`: the same
`data-slot` attributes and the same `cn()` composition, so the two files read
alike.

Root, Trigger, Portal, Content, Item, Separator. Nothing else. No submenus, no
checkbox or radio items, no groups, no labels: each is a surface that has to
keep working across four screens and two catalogues, and none of them is
needed. A later screen that wants one adds it then.

## 2. `RowActions`, so the behaviour is written once

One component above the primitive, taking

- an optional `inline` action, rendered as a `Button` or `ButtonLink` beside
  the trigger,
- a list of `{ key, label, onSelect | to, destructive? }`,
- an `aria-label` for the trigger that carries the row's own name.

Four screens compose with it, so the keyboard handling, the focus rules and the
44px floor exist in one file rather than four. `MemberActions` was extracted for
this reason already and becomes a caller.

`EventCard` does not change. It still takes `actions` as a `ReactNode` and
knows nothing about permissions — the screen decides which actions exist and
passes `<RowActions>`, exactly as its docblock requires. A card that assembled
its own menu would have to be edited for every future control.

## 3. The focus trap, which is the actual work

Radix's `DropdownMenu` defaults to `modal={true}`. That puts
`pointer-events: none` on `<body>` for as long as the menu is open, and returns
focus to the trigger when it closes. Selecting an item that opens
`ConfirmByTypingName` — an `AlertDialog` — then has two overlays handing focus
to each other within one tick.

The failure mode is a dialog that cannot be typed into, and the dialog in
question is the one that requires typing a person's full name to confirm a
delete. It would look like a working menu and a working dialog.

Two rules avoid it:

1. **`modal={false}` on the menu.** It stops the body lock and the focus
   return, and it is what Radix recommends when a menu composes with a dialog.
2. **The dialog keeps opening from the screen's state**, as it does today, and
   never from inside the menu item's own subtree. `onSelect` sets state; the
   menu unmounts and the dialog mounts in order.

Neither rule is self-evident from reading the result, so both get a comment at
the line and a test that fails when they are removed (§6).

## 4. Accessible names and the two catalogues

Every item's accessible name keeps carrying the event's or the person's name.
A screen-reader user must not hear the twelfth bare `Supprimer` on the page,
which is what the docblock at `web/src/pages/Members.tsx:490-501` is about, and
the strings already exist: `events.deleteAria`, `events.editAria`,
`events.whoComingAria`, `events.registrationsAria`, `events.optionsAria`,
`members.resetTitle`, `registrations.cancelAria`, `registrations.amendTitle`.
The menu inherits them rather than inventing a second set to drift from.

The trigger needs one new key, in French **and** German —
`catalogues.test.ts` fails on a key present in one catalogue and absent from
the other. Its name carries the row: "Autres actions pour {title}".

The trigger's glyph is `lucide-react`'s `Ellipsis`, with `aria-hidden="true"`
on the `<svg>` and the French in `aria-label`, which is what #131 settled. The
`icon-*` size variants already carry `min-w-touch`, so the trigger is 44x44
without anyone thinking about it.

## 5. Per screen

| Screen                            | inline         | behind the menu                                            | row            |
| --------------------------------- | -------------- | ---------------------------------------------------------- | -------------- |
| `/events`                         | `Qui vient ?`  | `Inscriptions`, `Ce qu'on réserve`, `Modifier`, `Supprimer` | 148px -> 44px  |
| `/members`                        | `Modifier`     | `Mot de passe`, `Supprimer`                                 | 44px -> 44px   |
| `/events/{id}/registrations`      | `Modifier`     | `Annuler`                                                   | one item       |

`Qui vient ?` stays inline because it is the weekly action and the one reason
most people open the planning. `Modifier` is the inline one on the other two
for the same reason: it is what a correction starts with.

`Supprimer` loses `variant="destructive"` on the roster. It becomes an ordinary
menu item at the same weight as its neighbours, which settles the
two-treatments-for-one-action complaint in the direction André chose on
2026-09-21. The filled red block was the most prominent thing on a member's
card, above their own name, and `ConfirmByTypingName` is the actual guard —
the button does not also have to shout.

`/members` gains no vertical space from this. It is here for one pattern across
the committee's screens, which is what André asked for, and to settle the
`Supprimer` treatment.

`/events/{id}/registrations` gets a one-item menu. Thin, and accepted for the
same reason.

### `/events/{id}/registration-options` is deliberately left alone

Its rows are draft rows inside a form, not records in a list, and its actions
are `Monter`, `Descendre` and `Retirer`. Reordering is spatial and repetitive:
moving a row up three places is three taps today and three open-select-close
cycles behind a menu, because Radix closes the menu on select and there is no
way to make that cheap. A menu holding only `Retirer`, beside two inline
buttons, would be more pattern rather than less.

Raised as a disagreement with the "all four screens" answer and settled by
André the same day: the screen keeps what it has.

## 6. How it is tested

**Component, per screen.** The menu opens by its accessible name; each item is
found by the name carrying the row's own name; selecting the destructive item
opens the dialog. `userEvent`, not `fireEvent` — Radix renders through a portal
and needs real pointer and key sequences.

**The focus rules, mutation-tested.** A test that passes whether or not
`modal={false}` is there asserts nothing. The guard is: with the menu's
`modal` prop flipped back to `true`, a test fails. That has to be demonstrated
by doing it, not asserted in the PR body — four E2b tests once asserted nothing
here and only reintroducing the bug caught them.

**Playwright at 390px.** The souper's action row is one line, and
`document.scrollWidth === document.clientWidth` still holds across `/events`,
`/members` and `/account`. The existing overflow guard in
`web/e2e/members.spec.ts` already covers the second half and gains the first.

**`oneLayoutPerRow.test.ts` stays green.** Nothing here adds a viewport-switched
pair, and the menu renders at every width.

## 7. Closing evidence

A green suite is routinely green over a visibly broken page here, so the PR
carries:

- a 390px screenshot of `/planning` on the five-action souper card and of
  `/membres`,
- the action row measured before and after: 148px -> 44px on the souper, 96px
  -> 44px on a rehearsal, and the card 388px -> 284px,
- `document.scrollWidth === document.clientWidth` at 390px, still holding,
- the mutation test demonstrated red.

## 8. Out of scope

- **Icons on the per-row actions.** #132 keeps them, and shrinks: #118 has now
  answered its open question, and the answer is that icons are not the
  mechanism. What is left there is the icon rule itself and the primary page
  actions.
- **The page-level buttons above the first card.** `Ajouter un événement`,
  `Ajouter une série` and `Voir les événements passés` cost about 170px over
  two lines at 390px, which is why barely one card clears the fold. Noticed
  while measuring; a separate problem and a separate issue.
