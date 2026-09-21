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
focus behaviour — which §3 measures, and which turns out to cost less than
this section first claimed too. Radix supplies the keyboard behaviour, and the
focus handoff the issue worried about does not misbehave.

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

## 3. The focus handoff, and what `modal={false}` actually buys

A menu item that opens `ConfirmByTypingName` means a Radix `DropdownMenu`
closing while an `AlertDialog` opens.

**This section used to say that at the menu's default `modal={true}` the
result is "a dialog that cannot be typed into", and that `modal={false}`
prevents it. Both halves were wrong**, and they were written from knowledge
rather than measured. Measured, against the real dialog:

| opened from                    | `body.style.pointerEvents` | field typable |
| ------------------------------ | -------------------------- | ------------- |
| menu `modal={true}`            | `none`                     | yes           |
| menu `modal={false}`           | `none`                     | yes           |
| **a plain button, no menu**    | `none`                     | —             |

**The body lock is the dialog's, not the menu's.** It is there with no menu in
the tree at all, because `AlertDialog` is modal and that is what modal means.
`DismissableLayer` keeps its disabled layers in a `Set` and restores the
original value only when that set empties, so the menu's teardown cannot
unlock the body early and the dialog's teardown restores it.

**The focus return is not the `modal` prop either.** `DropdownMenuContent`'s
`onCloseAutoFocus` refocuses the trigger unless `hasInteractedOutsideRef` is
set, and `modal` reaches that ref only through `onInteractOutside`. Selecting
an item is not an outside interaction, so the trigger is refocused identically
in both modes. `modal={false}` does not change the path this design walks.

**Nor is it a race.** `FocusScope` defers its unmount autofocus behind a
`setTimeout(..., 0)`, so the trigger refocus lands a macrotask after the
dialog has mounted and focused its own Cancel button. The dialog wins it: its
`FocusScope` was pushed onto `focusScopesStack` after the menu's, which pauses
the menu's and leaves the dialog's trapping, so a `focusin` on the trigger is
pulled straight back inside.

The worst real symptom at `modal={true}` is therefore a focus flicker to the
`...` trigger and back, which nobody sees on the phone this issue is about.

### What still argues for `modal={false}`

Three smaller things, each true of the installed code:

- `MenuRootContentModal` calls `hideOthers(content)`, which marks the rest of
  the page `aria-hidden` for as long as the menu is open.
- It mounts `RemoveScroll`, which stacks with the dialog's own through the
  menu's exit animation.
- It adds a second focus trap and a second entry to the body-lock refcount,
  and both have to unwind in the right order for the dialog to behave.

None of that is a bug today. All of it is machinery this design does not need,
because a menu of four items over a card has no reason to imprison the page,
and `modal={false}` removes it by construction instead of resting on two
libraries' teardown order staying correct.

**The claim that Radix recommends `modal={false}` here is withdrawn.** It is
community guidance rather than anything in Radix's documentation, and the
argument above does not need it.

### The rule that is load-bearing

The dialog opens from the screen's own state and never from inside the menu
item's subtree. `Events.tsx` and `Members.tsx` already work this way, so it
costs nothing — and unlike the `modal` prop, breaking it breaks something a
user would meet: a dialog rendered inside `DropdownMenu.Content` is unmounted
by the menu's own close, so it never appears at all. That is what §6
mutation-tests.

### What is still unmeasured

The table above is jsdom plus a reading of the installed Radix source. jsdom
does no hit-testing and its focus model is not a browser's, so neither line of
evidence is Chrome on a phone. The Playwright case in §6 is what closes that
gap, and is the reason there is one.

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

**The load-bearing rule, mutation-tested.** Flipping `modal` back to `true`
is *not* the mutation. §3 shows there is no observable difference on the
item-select path, and the assertion somebody would reach for first —
`expect(document.body.style.pointerEvents).not.toBe("none")` — is false with
`modal={false}` too, because the dialog sets it.

The falsifiable rule is the other one. Move `ConfirmByTypingName` inside
`DropdownMenu.Content` and the dialog never appears, because the menu's own
close unmounts it. That is the mutation, and it has to be demonstrated by
doing it rather than asserted in the PR body — four E2b tests once asserted
nothing here, and only reintroducing the bug caught them.

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
