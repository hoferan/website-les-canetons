# The planning's page-level controls

Design for [#182](https://github.com/hoferan/website-les-canetons/issues/182),
split out of [#118](https://github.com/hoferan/website-les-canetons/issues/118)
on purpose: that issue is the per-ROW action buttons, this is the three
PAGE-level ones above the first card. Decided 2026-09-22.

Measured on the mocked stack (`vite --mode mock`) at a 390x844 viewport, every
candidate built as real DOM in the running app and measured, the way #118's
spec did rather than argued about.

## What was re-measured, because #182 predates #118 landing

The issue's own numbers reproduce exactly. As `demo.direction`, who holds
`events.manage`, against 358px of usable width (390px less `px-4` each side):

| control                      | width | y   |
| ---------------------------- | ----- | --- |
| `Ajouter un événement`       | 175px | 201 |
| `Ajouter une série`          | 144px | 201 |
| `Voir les événements passés` | 213px | 261 |

Two rows, 104px of controls (44 + 16 + 44), and the first event card at
**y=337**. All three numbers are the issue's.

**One number in it is now stale, and it is the one it asks to be closed on.**
The issue says "exactly one card is fully above the fold". It is **two**. #118
merged after #182 was written and took the per-row action block from 148px to
44px, so an event card went from ~294px to 242px and the second card now ends
at y=837 of 844 — 7px inside the fold. Same problem #118's spec hit with
[#146](https://github.com/hoferan/website-les-canetons/issues/146), and the
same fix: re-measure before designing.

## The card count cannot move at all, so it is the wrong criterion

Every page-level control was deleted from the running page and the result
measured. That layout is not shippable; it answers one question only.

| variant                   | first card top | 3rd card bottom | cards fully above 844 |
| ------------------------- | -------------- | --------------- | --------------------- |
| today                     | 337            | 1123            | 2                     |
| this design               | 287            | 1073            | 2                     |
| **floor, zero controls**  | **217**        | **1003**        | **2**                 |

y=217 is the floor: the site header, the section's `py-8`, the `h1` and its
`mt-block` are all above the first card and none of them is this issue's. A
third card needs the first to start at y=58, which is above the page header.
**The metric is saturated at two and no layout change can move it.**

So this design closes on the control block's height, the first card's y, and
the screenshots — and this section exists so that nobody re-derives the
floor.

## Decided 2026-09-22

The issue records three open points and decides none. André decided all three,
plus a fourth that the measurement raised.

1. **One extra tap to create is acceptable.** A season is planned at a desk,
   not at the Werkhof on a Saturday morning. Both `Ajouter` controls collapse
   behind one trigger.
2. **`Voir les événements passés` becomes a two-option view switch.** It
   toggles which half of the list is shown, so it is a view control, and the
   issue's own words for it are "a view switch wearing a button".
3. **Nothing moves below the first card.** A control the reader has to scroll
   past the content to find is a control they will not find, and one 44px row
   is no longer the largest cost above the fold.
4. **The view switch stays in this PR although it buys no pixels.** Raised
   because the measurement showed it: see §2, where the honest accounting is.

## What it costs and what it buys

| | today | this design |
| --- | --- | --- |
| control rows, `events.manage` | 2 | **1** |
| control block, `events.manage` | 104px | **44px** |
| first card top, `events.manage` | 337 | **287** |
| first card top, a player | 353 | 355 |
| cards fully above the fold | 2 | 2 (saturated) |
| `scrollWidth - clientWidth` at 390px | 0 | 0 |

## 1. The add control

One primary button reading `Ajouter` (**103px**), opening a two-item menu.

**The whole 50px is this, and it is this because of one adjacency.** The
heading is 170px and the trigger 103px: 170 + 103 + 16 of gap is 289px against
358px, so the trigger sits on the heading's own line and its row disappears
altogether. Today's pair is 175 + 144 + 8 = 327px, which fits on one line but
cannot fit beside the heading, so it costs a row. Anything that keeps a
full-length label beside the heading costs that row back.

**Composed in `Events.tsx` from `ui/dropdown-menu.tsx`, not through
`RowActions`.** `RowActions` is row-shaped — it takes a `rowName`, promotes an
`inlineKey`, and counts what is left to decide whether a trigger is drawn at
all. A page-level trigger with nothing inline beside it is not that thing, and
widening `RowActions` to cover both would give one component two unrelated
jobs. About fifteen lines over the same primitive is the cheaper answer.

**The two menu items keep `events.add` and `events.addSeries` verbatim** —
`Ajouter un événement` / `Ajouter une série`, `Anlass hinzufügen` /
`Serie hinzufügen` — because a menu item has to stand alone for somebody
reading the menu with a screen reader, and `Un événement` does not. The
trigger adds `events.addTrigger`: `Ajouter` / `Hinzufügen`.

Three consequences, each of which was checked rather than assumed:

- **`events.emptyHint` keeps working, unchanged.** It interpolates
  `t("events.addSeries")`, and that key's value does not move. The hint
  therefore still quotes the exact words now sitting in the menu, and the trap
  it was written to avoid — spelling a button's label out a second time, so
  the two come to disagree — is not reintroduced.
- **The trigger's accessible name is `Ajouter au planning`** (`Zum Programm
  hinzufügen`), which starts with the visible `Ajouter`, so a voice-control
  user saying the visible word still matches it (WCAG 2.5.3). That is the rule
  `ButtonLink`'s docblock already states for the row actions.
- **Both items are real anchors**, `DropdownMenuItem asChild` straight to
  react-router's `Link`, never `useNavigate`. One Slot layer lands Radix's
  props and two drops them — the mechanism `RowActions`'s `ItemFor` docblock
  sets out, learned by watching the test fail that way.

## 2. The view switch

`Planning | Passés` as one control: **169px** (90 + 77) against today's 213px,
on the same 44px row.

**The honest accounting: this buys zero height, and costs a player 2px.** The
segmented control's border makes it 1px taller than a bare button, so a reader
without `events.manage` — who never had the `Ajouter` pair — goes from a first
card at y=353 to one at y=355. It is kept anyway, reaffirmed on 2026-09-22
knowing this, for two reasons that are not about space:

- **It stops a view switch looking like an action.** It sat in a row beside
  the calendar toggle, in the same `variant="outline"`, reading as a third
  thing to do rather than as which half of the list is on screen.
- **It fixes a real accessibility gap.** Today's toggle announces nothing about
  which view is current: it is a plain `Button` with no `aria-pressed`, while
  the calendar toggle two lines below it in the same file has one. A reader who
  cannot see which of two labels is filled has no way to know whether they are
  looking at the planning or the past.

**Its labels are new keys, and two old ones die.** `events.showPast` and
`events.showPlanning` are imperative sentences for a button that performs a
switch — `Voir les événements passés`, `Planung anzeigen` — and a segment is a
name, not an instruction. So the switch takes `events.viewPlanning` and
`events.viewPast`, and the two old keys are **deleted**: `Events.tsx:343` is
their only call site in the whole app, checked by grep, so leaving them would
leave dead strings in both catalogues.

Five keys are added in total — `addTrigger` and `addTriggerAria`, the two the
switch's labels need (`viewPlanning`, `viewPast`), and the `viewSwitchAria` the
`radiogroup` below requires — and two are removed. The `Aria` pair are keys
rather than literals because every string the app renders lives in a catalogue,
an accessible name included.

One comment has to move with them. `fr.ts`'s `seePlanning` carries a docblock
saying "ITS OWN KEY, not `events.showPlanning`. That one toggles a list between
upcoming and past" — which would name a key that no longer exists. It is
re-pointed at `viewPlanning`, keeping the distinction it was written to make.

**Measured German, because the adjacency in §1 is load-bearing and German is
where it would break.** At 390px, `/de/events`:

| | French | German |
| --- | --- | --- |
| heading | `Planning` 170px | `Planung` **152px** |
| trigger | `Ajouter` 103px | `Hinzufügen` **131px** |
| heading + trigger + gap | 289px | **299px** of 358px |
| the switch | `Planning \| Passés` 169px | `Planung \| Vergangene Anlässe` **250px** |

German is 10px wider on the line that matters and clears it by 59px, so the
saving holds in both locales. The switch's widest German pair fits with 108px
to spare; three shorter pairs were measured too (`Vergangene` 195px, `Archiv`
161px, `Vorbei` 160px) and none of them is needed to fit.

`Vergangene Anlässe` is chosen over the shorter three to match the noun the
catalogue already uses — its comment insists on *Anlass*, the Swiss word a
Guggenmusik says, over *Veranstaltung* — and because a bare adjective is not a
label. **This is the one wording call in the spec; say so in review if you
want another.**

**A vendored `web/src/components/ui/toggle-group.tsx`**, from `radix-ui`'s
`ToggleGroup` exactly as `dropdown-menu.tsx` vendors `DropdownMenu`: the same
`data-slot` attributes, the same `cn()` composition, and **every `dark:`
utility stripped**, for the reason `ui/button.tsx` sets out at length — this
app declares no `dark` custom variant, so Tailwind 4 compiles one to a
`prefers-color-scheme` media query that fires on any phone set to dark, which
at a rehearsal at night is most of them.

**No new package.** `radix-ui` ^1.6.7 is already a direct dependency and
already re-exports `ToggleGroup` (`Root`, `Item`); `@radix-ui/react-toggle-group`
is already installed as one of its transitives. Verified at runtime, not
inferred from the lockfile.

Root and Item. Nothing else.

**`type="single"`, which IS a radio group — checked in the installed package,
not taken from the docs.** Radix renders `role="radiogroup"` on the root and
`role="radio"` plus `aria-checked` on each item, and explicitly sets
`aria-pressed` to `undefined`
(`@radix-ui/react-toggle-group/dist/index.js:62,189`). So this control
announces "Planning, radio button, 1 of 2, checked", not a pressed state, and
`ToggleGroup` supplies the roving focus and the arrow keys on top.

That is the right announcement for what this is — choose one of exactly two
views — and it is why **tabs were rejected**: tabs imply a `tabpanel`
relationship that does not exist, since this is one list showing one of two
contents rather than two panels.

**A `radiogroup` must carry an accessible name**, so the group takes
`events.viewSwitchAria`: `Vue du planning` / `Ansicht der Planung`. Without it
a screen reader announces two radios belonging to nothing.

An earlier draft of this spec claimed the switch would fix a missing
`aria-pressed` and rejected "a radio group" in the same breath. Both were
wrong, and in opposite directions; they are recorded here because the mistake
is easy to repeat from Radix's own naming — a component called *ToggleGroup*
whose single-select mode emits no toggle semantics at all.

**Deselection has to be guarded in the handler, because Radix has no prop for
it.** A `type="single"` group lets the active item be pressed again to clear
the value, and `onValueChange` then fires with `""` — which here would mean a
planning that is neither upcoming nor past. There is no `disableDeselection`
option to set, so the handler ignores an empty value and the state only ever
moves between the two views. This is the kind of claim worth checking against
the installed version rather than the docs: the guard is in `Events.tsx`, and
`toggle-group.test.tsx` pins it.

## 3. What this design does not change

- **The calendar toggle.** Still `hidden md:inline-flex` and still gated on
  `config.features.calendar`, which is off on every server, so it is absent at
  390px and contributes nothing to this measurement. Whether it becomes a
  second caller of `toggle-group.tsx` is a later question and not this issue's.
- **The day filter.** Its row is rendered only when a day is chosen, and `past`
  replaces the list rather than narrowing it, so the two do not belong in one
  control. Rejected on 2026-09-22.
- **The `past` state's home.** It stays `useState` in `Events.tsx`. Putting the
  view in the URL is a real improvement — a shareable link, a working back
  button — and it is a separate change with its own reasons; doing it here
  would widen a layout fix into routing.
- **`EventCard`, `RowActions`, and every per-row action.** #118 owns those and
  is closed.

## 4. Rejected, with the reason

- **Keep both `Ajouter` controls visible, save elsewhere.** The row *is* the
  cost. 175 + 144 cannot sit beside a 170px heading at 390px, so any variant
  that keeps a full label loses the whole saving.
- **An icon-only `+` trigger.** Narrowest, and rejected for the reason #118
  rejected icon buttons for the row actions: an unlabelled primary in an app
  whose committee opens some screens once a season, needing a glyph vocabulary
  that was a guess.
- **Primary keeps `Ajouter un événement`, a `…` holds the series.** A one-item
  menu is a tap to reveal a button, which `RowActions` refuses on principle and
  documents in its docblock.
- **Move the view switch below the first card.** Buys another 60px and hides
  the only control a player has, so they would have to scroll past an event to
  learn that past events exist.
- **A compact toggle button instead of a segmented control.** Cheaper, no
  primitive, and an `aria-pressed` on it would announce the current view as
  well as the radiogroup does — but it leaves a view switch shaped like an
  action, which is the complaint.
- **Inline in `Events.tsx`, or a `ViewSwitch` in `components/`.** The first
  loses roving focus and arrow keys and gets rewritten by the next screen; the
  second is a layer above a primitive that has one caller. `ui/` is where the
  other two vendored surfaces live.

## 5. Tests

**The one that is not optional.** `web/src/pages/Events.test.tsx:129-130`:

```ts
expect(screen.queryByRole("link", { name: /Ajouter un événement/ })).toBeNull();
expect(screen.queryByRole("link", { name: /Ajouter une série/ })).toBeNull();
```

Those two links move into a menu, and a Radix menu item is not in the DOM
until the menu opens — so both queries return null **for an organiser too**,
the test passes for every reader, and the line still reads as coverage. This
is precisely the failure `docs/traps.md` gained an entry for on 2026-09-21,
and this change is that entry's first customer. It is rewritten to assert the
**trigger's** absence, matched by `aria-haspopup="menu"` and never by a French
accessible name — a French name passes vacuously on `/de/*` — and it is
watched failing with the `mayManage` gate removed, because an assertion nobody
has watched fail is not a guard.

**`expectNoSuchAction` needs no change, and that was checked.** It asserts
`overflowTriggers()` is empty, and a page-level trigger would count. Its three
call sites run as `demo.player` and `demo.committee`, neither of whom holds
`events.manage`, so no page-level trigger is rendered for them and the count
stays 0. To be re-confirmed by running the suite, not by reading it.

**Four call sites convert.** `Events.test.tsx:135-139`, the organiser's two
hrefs, becomes: open the menu, assert both items and their destinations.
`:153`, `:441` and `:853` click `Voir les événements passés`; each becomes a
click on the switch's `Passés` option.

**`web/src/components/ui/toggle-group.test.tsx`**, new, mirroring
`dropdown-menu.test.tsx`: arrow-key roving focus, the selected state on the
active item, that pressing the active item does not clear the value, and the
44px floor.

**E2E, where the closing condition actually lives.** The `/events` branch of
`web/e2e/members.spec.ts`'s overflow test, beside #118's souper guard: as
`demo.direction` at 390px, the heading's row holds the trigger (one line, so a
`boundingBox().height <= 48`, the same threshold and the same reason as the
souper's action row) and the first card's top is under 300. With
`scrollWidth - clientWidth <= 0`, which that test already holds. Measured in a
real browser rather than trusted from jsdom, which is the lesson of #118's own
e2e commit.

**German needs no assertion of its own.** `de.ts` is declared `typeof fr`, so
the one new key fails `npm run typecheck` until both catalogues carry it.

## 6. Review focus

1. **Does the trigger still share the heading's line?** The whole saving is one
   adjacency, and if it ever stops holding the layout simply wraps back to two
   rows and **nothing fails** — no test, no type error, no lint. German is
   measured above and clears it by 59px, so the risk is not today's copy but
   tomorrow's: a renamed heading, a longer trigger label, a third control added
   to that row. The e2e height assertion is the only thing standing between
   that and a silent regression, so check it actually fails when the row wraps
   rather than trusting that it would.
2. **Is any negative assertion in `Events.test.tsx` still vacuous?** Remove the
   `mayManage` gate and watch each rewritten one fail.
3. **Touch.** #118's tap-through test exists because a mouse click cannot catch
   it; the page-level menu sits directly above the first card's own controls,
   so a tap on `Ajouter une série` closing the menu must not also land on what
   is underneath.
4. **What a screen reader actually says when the view changes**, given the
   switch is a `radiogroup`: the list below is replaced, not filtered, and
   nothing announces the replacement. Check whether the radio's own state
   change is enough, or whether the count under the heading should be a live
   region — and if it should, say so and leave it to its own issue rather than
   growing this one.

## 7. Close it with

- The control block's height and the first card's y, before and after, for
  `demo.direction` and for a player: 104px/337 and 44px/287; 353 and 355.
- 390x844 screenshots of `/events` as `demo.direction` and as `demo.player`.
- `document.scrollWidth === document.clientWidth` still holding at 390px, from
  [#89](https://github.com/hoferan/website-les-canetons/issues/89).
- The note that the card count reads 2 before and 2 after, with the floor
  measurement that shows why it cannot read 3.
