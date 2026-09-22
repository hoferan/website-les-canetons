# The planning's page-level controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the planning's page-level control block at 390px from two rows and 104px to one row and 44px, by collapsing the two `Ajouter` controls behind one labelled trigger and turning the past toggle into a two-option view switch.

**Architecture:** Two independent changes to one screen, `web/src/pages/Events.tsx`. The add control is a `DropdownMenu` composed directly in that file over the existing `ui/dropdown-menu.tsx` primitive — not through `RowActions`, which is row-shaped. The view switch is a new vendored primitive, `ui/radio-group.tsx`, wrapping `radix-ui`'s `RadioGroup` — not its `ToggleGroup`, which emits radio roles without radio keyboard behaviour (spec §2). No API change, no generated-client change, no migration.

**Tech Stack:** React 19 + TypeScript, Vite 8, Tailwind 4 (CSS-first, tokens in `web/src/styles.css`), `radix-ui` ^1.6.7, `lucide-react`, Vitest + Testing Library, Playwright against the MSW-mocked backend.

**Spec:** `docs/superpowers/specs/2026-09-22-planning-page-controls-design.md`. Read §1, §2 and §5 before Task 1. Issue: [#182](https://github.com/hoferan/website-les-canetons/issues/182).

## Global Constraints

- **The 44px touch floor.** `--spacing-touch: 2.75rem` in `web/src/styles.css`. Every interactive control clears it; `min-h-touch` goes on a base class, never at a call site, so it is not a convention somebody forgets.
- **No `dark:` utility anywhere in `web/src/components/ui/`.** This app declares no `dark` custom variant, so Tailwind 4 compiles one to a `prefers-color-scheme` media query that fires on any phone set to dark. Do not write one even inside a comment — Tailwind scans comments as plain text and will generate the class.
- **Never the `disabled` attribute on a button.** `aria-disabled` plus an early return in the handler. See `ui/button.tsx`'s docblock.
- **Every new user-facing string exists in BOTH catalogues**, `web/src/i18n/fr.ts` and `web/src/i18n/de.ts`. `de.ts` is declared `typeof fr`, so a key in one and not the other fails `npm run typecheck` before any test runs.
- **Everything is written in English** except user-visible UI text: code, comments, identifiers, test names. The catalogues hold the French and German.
- **An accessible name that extends visible text must START with that text** (WCAG 2.5.3), so a voice-control user saying the visible word still matches. **This plan got that wrong in German on its first pass** — it specified `Zum Programm hinzufügen`, which ends with the visible word instead of leading with it, and used a noun (`Programm`) appearing nowhere else in `de.ts`. German word order pushes a separable verb to the end, so the rule needs checking in both languages rather than assumed from the French.
- **`web/src/api/generated/` is never hand-edited.** Nothing in this plan touches it.
- **Run `npm run check` before pushing.** It does not build and does not run the Laravel suite; neither is needed here, since no PHP changes.
- **`npm install` in a web session strips 24 `libc` hints from `package-lock.json`.** That is an environment artifact, not a change. Run `git status` before every commit and `git checkout -- package-lock.json` if it appears.

## The measured target

From the spec, at 390x844 on the mocked stack as `demo.direction`:

| | today | after |
| --- | --- | --- |
| control rows | 2 | **1** |
| control block | 104px | **44px** |
| first card top | 337 | **287** |
| first card top, a player | 353 | 355 |
| cards fully above the fold | 2 | 2 (saturated — see the spec's floor measurement) |
| `scrollWidth - clientWidth` | 0 | 0 |

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `web/src/components/ui/radio-group.tsx` | **Create.** Vendored `RadioGroup` Root + Item. Styling and the 44px floor. Knows nothing about the planning. | 1 |
| `web/src/components/ui/radio-group.test.tsx` | **Create.** The primitive's roles and state. Not the floor, not the arrow key — see Task 1. | 1 |
| `web/src/i18n/fr.ts` | **Modify.** `:527-531` add 4 keys, delete 2. `:715-718` re-point one comment. | 2, 3 |
| `web/src/i18n/de.ts` | **Modify.** `:314-318` the same 4 and the same 2. | 2, 3 |
| `web/src/pages/Events.tsx` | **Modify.** `:337-344` the switch (Task 2); `:324-335` the add control (Task 3). | 2, 3 |
| `web/src/pages/Events.test.tsx` | **Modify.** 3 call sites for the switch (Task 2); the vacuous assertion and the organiser test (Task 3). | 2, 3 |
| `web/e2e/members.spec.ts` | **Modify.** The `/events` branch of the overflow test gains the one-row guard. | 4 |

Task order is forced only at 1 → 2. Task 3 is independent of Tasks 1 and 2; Task 4 measures the result of 2 and 3 together.

**Added after Task 2 was built (2026-09-22):** Task 2's implementer discovered that the brief asked it to assert a heading that can never render — `events.pastHeading` is unreachable, because `Events.tsx:461-467` gates the `<h2>` on `awaiting.length > 0` and `awaiting` is always empty in the past view. André chose to fix it in this branch rather than defer it, so Task 2 gains a fix pass: the gate becomes `showingPast || awaiting.length > 0`, and the assertion the brief originally wanted is restored. The spec's §3 records the reasoning. No measurement changes — the closing numbers are all of the upcoming view.

---

### Task 1: The `radio-group` primitive

A vendored surface with no knowledge of the planning, so it is testable and reviewable on its own.

**Files:**
- Create: `web/src/components/ui/radio-group.tsx`
- Create (test): `web/src/components/ui/radio-group.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; `RadioGroup as RadioGroupPrimitive` from `radix-ui`.
- Produces: `RadioGroup` and `ToggleOption`, both `React.ComponentProps<typeof RadioGroupPrimitive.Root | .Item>` pass-throughs. Task 2 consumes exactly these two names. The root takes Radix's `value`, `onValueChange`, `orientation` and `aria-label`; each item takes `value`.

**Read first:** `web/src/components/ui/dropdown-menu.tsx` — this file is its sibling and must read alike: same `data-slot` naming, same `cn()` composition, same docblock habit of saying *why*.

**Why `RadioGroup` and not `ToggleGroup`:** the spec's §2 has the full account. The short version, which you should not have to rediscover: `ToggleGroup type="single"` emits `role="radiogroup"` but contains no arrow-key handling at all, so it announces itself as a radio and does not behave as one. `RadioGroup` implements the pattern, and it also cannot be cleared by the user — so there is no empty-value guard anywhere in this plan.

**Two things you must NOT test here**, both tried and both rejected (spec §5):
- **The 44px floor.** jsdom computes no layout. The only assertion available is that the string `min-h-touch` appears in a `className`, which passes on a misspelling or on a class that loses the cascade. Task 4 measures it in a browser.
- **Arrow-key selection.** Radix's focus-to-select needs real focus events; under jsdom `{ArrowRight}` leaves `aria-checked` false. Task 4 asserts it in a browser.

Leave a comment in the test file naming both and pointing at Task 4's file, so the next reader does not re-add them.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/ui/radio-group.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { RadioGroup, ToggleOption } from "./radio-group";

/**
 * A controlled harness, because that is how /events uses it: the value is the
 * screen's own state.
 */
function Harness() {
  const [view, setView] = useState("planning");
  return (
    <RadioGroup
      value={view}
      orientation="horizontal"
      aria-label="Vue du planning"
      onValueChange={setView}
    >
      <ToggleOption value="planning">Planning</ToggleOption>
      <ToggleOption value="past">Passés</ToggleOption>
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("is a named radiogroup whose items carry the checked state", () => {
    render(<Harness />);

    const group = screen.getByRole("radiogroup", { name: "Vue du planning" });
    expect(group).toHaveAttribute("aria-orientation", "horizontal");
    expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Passés" })).not.toBeChecked();
  });

  it("moves the checked state when another option is chosen", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("radio", { name: "Passés" }));

    expect(screen.getByRole("radio", { name: "Passés" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Planning" })).not.toBeChecked();
  });

  /**
   * THE REASON NO CALL SITE NEEDS AN EMPTY-VALUE GUARD. A ToggleGroup would
   * have fired onValueChange("") here, which for /events would have meant a
   * planning that is neither upcoming nor past. A radio group cannot be
   * cleared by its user, and this is what says so.
   */
  it("keeps the checked option checked when it is pressed again", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("radio", { name: "Planning" }));

    expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
  });
});

// TWO ASSERTIONS DELIBERATELY ABSENT, both tried first:
//
// THE 44px FLOOR. jsdom computes no layout, so all this file could check is
// that the token "min-h-touch" appears in a className — which passes just as
// happily if the token is misspelled, if styles.css stops defining
// --spacing-touch, or if a later class in the cascade overrides the height.
//
// ARROW-KEY SELECTION. Radix selects on arrow by calling click() from the
// item's onFocus while an arrow is held, and that needs real focus events:
// under jsdom {ArrowRight} leaves aria-checked false. It is the behaviour this
// primitive was chosen FOR, so it is asserted rather than dropped —
// just not here.
//
// Both live in web/e2e/members.spec.ts, measured in a real browser.
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run web/src/components/ui/radio-group.test.tsx
```

Expected: FAIL — `Failed to resolve import "./radio-group"`. Not a single assertion should run yet.

- [ ] **Step 3: Write the primitive**

Create `web/src/components/ui/radio-group.tsx`:

```tsx
import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * A SEGMENTED CONTROL: pick one of a few views, all of them visible at once.
 *
 * VENDORED from radix-ui, the same way ui/dropdown-menu.tsx and
 * ui/alert-dialog.tsx are: the same `data-slot` attributes and the same `cn()`
 * composition, so the three files read alike.
 *
 * TWO PARTS AND NO MORE. Root and Item — no `Indicator`, because a segment
 * shows its state by filling rather than by drawing a dot beside a label.
 *
 * NO `dark:` UTILITY, for the reason ui/button.tsx sets out at length: this app
 * declares no `dark` custom variant, so Tailwind 4 compiles one to a
 * prefers-color-scheme media query that fires on any phone whose OS is set to
 * dark, which at a rehearsal at night is most of them.
 *
 * WHY RadioGroup AND NOT ToggleGroup, which is the component whose name fits.
 * `ToggleGroup type="single"` renders role="radiogroup" and role="radio" — and
 * then never selects on an arrow key: its source has no arrow handling at all,
 * so the focus moves and `aria-checked` stays false behind it. It claims to be
 * a radio and does not behave as one. RadioGroup implements the pattern its
 * roles promise, by clicking the item its own onFocus lands on while an arrow
 * is held. The spec's §2 records the measurement.
 *
 * AND IT CANNOT BE CLEARED. A ToggleGroup hands the caller `onValueChange("")`
 * when the pressed item is pressed again, which on the planning would mean a
 * list that is neither upcoming nor past; every call site would need a guard.
 * A radio group has no such state, so no guard exists anywhere — see the test.
 *
 * THE ROOT NEEDS AN ACCESSIBLE NAME from its caller. A radiogroup without one
 * announces two radios belonging to nothing.
 */
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn(
        // `w-fit`, so the control is as wide as its options rather than as wide
        // as the row it sits in.
        "inline-flex w-fit items-center gap-[2px] rounded-md border bg-background p-[2px]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One segment. Named for what it is on screen rather than after the primitive:
 * `RadioGroupItem` would invite a caller to reach for a dot and a label.
 */
function ToggleOption({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="toggle-option"
      className={cn(
        // min-h-touch, not a height: the same 44px floor ui/button.tsx puts on
        // every control and ui/dropdown-menu.tsx puts on every menu item.
        //
        // `checked`, NOT `on`: RadioGroup's data-state is checked/unchecked
        // where ToggleGroup's would have been on/off.
        "inline-flex min-h-touch shrink-0 cursor-default items-center justify-center rounded-sm px-4 text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { RadioGroup, ToggleOption };
```

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
npx vitest run web/src/components/ui/radio-group.test.tsx
npm run typecheck
```

Expected: PASS, 3 tests; typecheck clean.

If `toBeChecked()` throws on a `role="radio"` that is not an `<input>`: jest-dom supports it via `aria-checked`, so this should not happen. If it does, keep the `getByRole("radio", ...)` query — the role is the thing under test — print `screen.getByRole("radio", { name: "Planning" }).outerHTML`, and report the exact error rather than weakening the assertion.

- [ ] **Step 5: Commit**

```bash
git status --short   # package-lock.json must NOT be listed; if it is, git checkout -- package-lock.json
git add web/src/components/ui/radio-group.tsx web/src/components/ui/radio-group.test.tsx
git commit -m "feat(web): a vendored radio-group primitive for segmented controls

Root and Item from radix-ui's RadioGroup, styled like its two sibling vendored
surfaces. No new package: radix-ui ^1.6.7 already re-exports it.

NOT ToggleGroup, whose name fits and whose behaviour does not: type=\"single\"
emits role=\"radiogroup\" and then never selects on an arrow key, so it claims
to be a radio without behaving as one. RadioGroup implements the pattern, and
cannot be cleared by its user — which is why no call site in this branch needs
an empty-value guard.

The test says why the 44px floor and the arrow key are asserted in Playwright
instead: jsdom computes no layout and Radix's focus-to-select needs real focus
events.

#182"
```

---

### Task 2: The view switch replaces the past toggle

**Files:**
- Modify: `web/src/pages/Events.tsx:337-344` (the toggle) and its imports
- Modify: `web/src/i18n/fr.ts:527-531` and `:715-718`
- Modify: `web/src/i18n/de.ts:314-318` and `:451`
- Modify (test): `web/src/pages/Events.test.tsx:153`, `:441`, `:853`

**Interfaces:**
- Consumes: `RadioGroup`, `ToggleOption` from Task 1.
- Produces: the catalogue keys `events.viewPlanning`, `events.viewPast`, `events.viewSwitchAria` in both files. Task 3 adds `events.addTrigger` beside them and must not collide.

**Read first:** the spec's §2 in full, and `web/src/pages/Events.tsx:337-364` — the calendar toggle shares that row and does not change.

- [ ] **Step 1: Add the three keys to both catalogues and delete the two dead ones**

In `web/src/i18n/fr.ts`, replace lines 529-530:

```ts
    showPast: "Voir les événements passés",
    showPlanning: "Voir le planning",
```

with:

```ts
    // THE TWO HALVES OF THE LIST AS NAMES, not as instructions. These replaced
    // showPast/showPlanning ("Voir les événements passés", "Voir le planning")
    // when the button became a two-option switch: a segment is labelled with
    // what it shows, and an imperative sentence 213px wide was what made the
    // control read as a third thing to do. #182.
    viewPlanning: "Planning",
    viewPast: "Passés",
    // THE RADIOGROUP'S OWN NAME, and it is required rather than polish: Radix's
    // type="single" renders role="radiogroup", which without a name announces
    // two radios belonging to nothing.
    viewSwitchAria: "Vue du planning",
```

In `web/src/i18n/de.ts`, replace lines 316-317:

```ts
    showPast: "Vergangene Anlässe anzeigen",
    showPlanning: "Planung anzeigen",
```

with:

```ts
    // ANLASS, wie überall in diesem Katalog: "Vergangene Anlässe", nicht
    // "Vergangenes". Ersetzt showPast/showPlanning — siehe fr.ts. #182.
    viewPlanning: "Planung",
    viewPast: "Vergangene Anlässe",
    viewSwitchAria: "Ansicht der Planung",
```

- [ ] **Step 2: Re-point the one comment that names a deleted key**

`web/src/i18n/fr.ts:715-717` reads:

```ts
    // ITS OWN KEY, not events.showPlanning. That one toggles a list between
    // upcoming and past; this one navigates to the planning after a series
    // was created. Same three words in French, two different jobs.
```

Replace with:

```ts
    // ITS OWN KEY, not events.viewPlanning. That one NAMES the upcoming half
    // of the list, as one segment of the view switch; this one is a link that
    // navigates to the planning after a series was created. Two different
    // jobs, and the switch's label is now one word where this is three.
```

- [ ] **Step 3: Run typecheck to see the deletion caught**

```bash
npm run typecheck
```

Expected: FAIL, naming `web/src/pages/Events.tsx` — `events.showPlanning` / `events.showPast` no longer exist. That failure is the proof the keys were dead-but-referenced in exactly one place, which is what the spec claims.

- [ ] **Step 4: Write the failing tests**

In `web/src/pages/Events.test.tsx`, add this helper next to the other helpers (after `positionOf`, around line 120), and use it at the three call sites:

```tsx
/**
 * Switch the list between its two halves.
 *
 * A RADIO, NOT A BUTTON. The control is `ui/radio-group.tsx`, which Radix
 * renders as a radiogroup — so a query for a button
 * named "Passés" finds nothing, and the old `getByRole("button", { name: "Voir
 * les événements passés" })` finds nothing either, because that string no
 * longer exists in any catalogue. #182.
 */
async function switchView(
  user: ReturnType<typeof userEvent.setup>,
  to: "Planning" | "Passés",
): Promise<void> {
  await user.click(screen.getByRole("radio", { name: to }));
}
```

Then add this test, which is the new behaviour:

```tsx
test("the view switch is a named radiogroup showing which half is on screen", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.player");

  expect(screen.getByRole("radiogroup", { name: "Vue du planning" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Passés" })).not.toBeChecked();

  await switchView(user, "Passés");

  expect(await screen.findByRole("radio", { name: "Passés" })).toBeChecked();
  expect(screen.getByRole("heading", { level: 2, name: "Événements passés" })).toBeInTheDocument();
});

/**
 * THE VIEW SURVIVES A SECOND PRESS. Not a guard in this file — a radio group
 * has no cleared state to fall into — but the planning is where it would have
 * been visible, so this is the screen-level proof that the primitive's property
 * actually reaches the reader. ui/radio-group.test.tsx pins the primitive half.
 */
test("pressing the half already on screen leaves the view where it is", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.player");

  await switchView(user, "Planning");

  expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
  expect(screen.queryByRole("heading", { level: 2, name: "Événements passés" })).toBeNull();
});
```

- [ ] **Step 5: Run them to make sure they fail**

```bash
npx vitest run web/src/pages/Events.test.tsx -t "view switch"
npx vitest run web/src/pages/Events.test.tsx -t "already on screen"
```

Expected: FAIL — `Unable to find an accessible element with the role "radiogroup"`.

- [ ] **Step 6: Replace the toggle in `Events.tsx`**

Add to the imports, after the `Button` import at line 4:

```tsx
import { RadioGroup, ToggleOption } from "@/components/ui/radio-group";
```

Replace lines 338-344 — the `<Button>` holding `showPast`/`showPlanning` — with:

```tsx
        {/* WHICH HALF OF THE LIST, as a switch rather than as a button. It was
            a 213px imperative sentence in the same `variant="outline"` as the
            calendar toggle beside it, so it read as a third thing to DO; and it
            carried no state at all, unlike that neighbour, so nothing announced
            which view was on screen. #182.

            NO GUARD ON THE INCOMING VALUE, and that is a property of the
            primitive rather than an omission here: a radio group cannot be
            cleared by its user, so `next` is always one of the two values
            below. ui/radio-group.tsx's docblock records what ToggleGroup would
            have cost instead. */}
        <RadioGroup
          value={showingPast ? "past" : "planning"}
          orientation="horizontal"
          aria-label={t("events.viewSwitchAria")}
          onValueChange={(next: string) => setShowingPast(next === "past")}
        >
          <ToggleOption value="planning">{t("events.viewPlanning")}</ToggleOption>
          <ToggleOption value="past">{t("events.viewPast")}</ToggleOption>
        </RadioGroup>
```

- [ ] **Step 7: Convert the three existing call sites**

At `web/src/pages/Events.test.tsx:153`, `:441` and `:853` (line numbers before this task's edits; find them by searching for `Voir les événements passés`), replace each

```tsx
  await userEvent.click(screen.getByRole("button", { name: "Voir les événements passés" }));
```

with

```tsx
  await switchView(user, "Passés");
```

Each of those three tests already has a `user` in scope if it called `userEvent.setup()`; if one uses the bare `userEvent.click` form, add `const user = userEvent.setup();` at the top of that test rather than passing `userEvent` to the helper.

- [ ] **Step 8: Run the whole Events suite and the typecheck**

```bash
npm run typecheck
npx vitest run web/src/pages/Events.test.tsx
```

Expected: typecheck clean; every test in the file passes, including the three converted ones.

- [ ] **Step 9: Check the German page renders the switch**

```bash
npx vitest run web/src/pages/Events.test.tsx -t "de"
```

Expected: PASS. If no German test in this file exercises the switch, that is fine — `de.ts` being `typeof fr` already made Step 3 fail until both catalogues carried the keys, and `web/src/i18n/catalogues.test.ts` covers parity. Do not add a German test that only re-asserts parity.

- [ ] **Step 10: Commit**

```bash
git status --short   # package-lock.json must NOT be listed
git add web/src/pages/Events.tsx web/src/pages/Events.test.tsx web/src/i18n/fr.ts web/src/i18n/de.ts
git commit -m "feat(web): the planning's past toggle becomes a view switch

A 213px imperative sentence in the same outline variant as the calendar toggle
beside it, carrying no state, becomes a two-option radiogroup naming the half
of the list on screen: 169px in French, 250px in German, and the current view
is announced for the first time.

Deletes showPast/showPlanning, whose only call site this was, and re-points
seePlanning's docblock at the key that replaced them. Refuses Radix's empty
value at the call site, because the primitive cannot.

No vertical saving, and 2px of cost to a reader without events.manage — the
semantics are the whole point. Measured in the spec's §2.

#182"
```

---

### Task 3: The `Ajouter` pair collapses behind one trigger

This is the task that buys the 50px. It is independent of Tasks 1 and 2.

**Files:**
- Modify: `web/src/pages/Events.tsx:324-335` and its imports
- Modify: `web/src/i18n/fr.ts` (one key, beside Task 2's), `web/src/i18n/de.ts` (the same)
- Modify (test): `web/src/pages/Events.test.tsx:127-142` — the two tests about creating

**Interfaces:**
- Consumes: `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`; `Button` from `@/components/ui/button`; `Link` from `react-router-dom`; `ChevronDown` from `lucide-react`.
- Produces: `events.addTrigger` in both catalogues. Nothing else depends on this task.

**Read first:** the spec's §1, `docs/traps.md`'s entry "A negative assertion goes vacuous when its control moves behind a menu", and `web/src/components/RowActions.tsx`'s `ItemFor` docblock — which is where the one Slot layer rule is written down.

- [ ] **Step 1: Add the trigger key to both catalogues**

`web/src/i18n/fr.ts`, after `addSeries` (line 528):

```ts
    // THE TRIGGER, whose menu holds `add` and `addSeries` above. One word,
    // because at 103px it fits beside the 170px heading and the full label at
    // 175px does not — and that adjacency is the whole of #182's saving.
    // Its accessible name STARTS with this visible word (WCAG 2.5.3).
    addTrigger: "Ajouter",
    addTriggerAria: "Ajouter au planning",
```

`web/src/i18n/de.ts`, after `addSeries` (line 315):

```ts
    // 131px gegen eine 152px breite Überschrift — passt, siehe fr.ts. #182.
    //
    // HINZUFÜGEN ZUERST: Der sichtbare Text muss am ANFANG des zugänglichen
    // Namens stehen (WCAG 2.5.3), sonst trifft die Spracheingabe auf
    // «Hinzufügen» nicht zu. Deutsche Wortstellung stellt das trennbare Verb
    // sonst nach hinten. Und PLANUNG, nicht «Programm»: das Wort, das dieser
    // Katalog überall sonst verwendet.
    addTrigger: "Hinzufügen",
    addTriggerAria: "Hinzufügen zur Planung",
```

- [ ] **Step 2: Fix the vacuous assertion FIRST, and watch it go vacuous**

This step exists because the test at `web/src/pages/Events.test.tsx:129-130` will keep passing after this task while proving nothing. Do it before the implementation so you see both states.

Replace the body of `test("a player is offered no way to create an event")`:

```tsx
test("a player is offered no way to create an event", async () => {
  // ABSENT, not refused: a control that leads to "Accès refusé" teaches people
  // that parts of the site are broken for them.
  //
  // THE TRIGGER'S ABSENCE IS THE ASSERTION. Both create links moved into a
  // dropdown in #182, and a Radix menu item is not in the DOM until the menu
  // opens — so the queryByRole for "Ajouter un événement" this test used to
  // make is now null for an organiser too, and passed for everybody. That is
  // the failure docs/traps.md has an entry for, and this screen is its first
  // customer.
  //
  // MATCHED BY aria-haspopup, NEVER by a French accessible name: on /de/* the
  // French name matches nothing and the clause carrying the meaning would pass
  // vacuously.
  await renderPlanning("demo.player");

  expect(overflowTriggers()).toHaveLength(0);
  expect(screen.queryAllByRole("link", { name: /Ajouter/ })).toHaveLength(0);
  expect(screen.queryAllByRole("button", { name: /Ajouter/ })).toHaveLength(0);
});
```

- [ ] **Step 3: Run it, and prove it is a real guard by breaking the gate**

```bash
npx vitest run web/src/pages/Events.test.tsx -t "no way to create"
```

Expected: PASS (the player has no trigger today either).

Now make it fail on purpose. In `web/src/pages/Events.tsx:327`, change `{mayManage ? (` to `{true ? (` and re-run:

Expected: FAIL, on `overflowTriggers()` once Step 4 lands, and on the link queries right now. **An assertion nobody has watched fail is not a guard** — this is the one place in the plan where you deliberately break the source. Revert the `{true ? (` immediately:

```bash
git diff web/src/pages/Events.tsx   # confirm nothing but your intended edit remains
```

- [ ] **Step 4: Write the failing test for the organiser's menu**

Replace `test("an organiser is offered both ways to create")`:

```tsx
test("an organiser gets both ways to create, behind one trigger", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  // ONE CONTROL ON THE HEADING'S LINE, and the two destinations inside it.
  const trigger = screen.getByRole("button", { name: "Ajouter au planning" });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");

  await user.click(trigger);

  const menu = await screen.findByRole("menu");
  // REAL ANCHORS, not a useNavigate call: middle-click and open-in-new-tab on
  // the event form are things a committee member does. asChild straight to
  // Link, one Slot layer — see RowActions' ItemFor docblock for why two drops
  // the props.
  expect(within(menu).getByRole("menuitem", { name: "Ajouter un événement" })).toHaveAttribute(
    "href",
    "/events/new",
  );
  expect(within(menu).getByRole("menuitem", { name: "Ajouter une série" })).toHaveAttribute(
    "href",
    "/events/new/series",
  );
});
```

- [ ] **Step 5: Run it to make sure it fails**

```bash
npx vitest run web/src/pages/Events.test.tsx -t "behind one trigger"
```

Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Ajouter au planning"`.

- [ ] **Step 6: Replace the pair in `Events.tsx`**

Add to the imports:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

and, with the other third-party imports:

```tsx
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
```

Replace lines 327-334 — the `mayManage` block holding the two `ButtonLink`s — with:

```tsx
        {mayManage ? (
          /* ONE TRIGGER, NOT TWO BUTTONS, and the reason is one adjacency. At
             103px this fits beside the 170px heading, so it costs no row of its
             own; the full label at 175px plus the series at 144px fit on a line
             together but never beside the heading, which is the 44px this
             removes. Creating is a desk job — a season is planned at home, not
             at the Werkhof on a Saturday morning — so one extra tap is the
             cheaper half of the trade. #182.

             NOT `RowActions`. That component is row-shaped: it takes a row's
             name, promotes an `inlineKey` and counts what is left to decide
             whether to draw a trigger at all. A page-level menu with nothing
             inline beside it is a different thing, and widening RowActions to
             cover both would give one component two jobs.

             THE ITEMS KEEP THEIR FULL LABELS. "Un événement" would be shorter
             and is what a menu under "Ajouter" reads like, but a menu item has
             to stand alone for somebody moving through the menu with a screen
             reader. This is also what keeps events.emptyHint honest: it quotes
             t("events.addSeries"), the same key rendered here. */
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" aria-label={t("events.addTriggerAria")}>
                {t("events.addTrigger")}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* asChild STRAIGHT TO Link, never through ButtonLink: a menu
                  item already carries its own styling and the 44px floor, and
                  ButtonLink destructures a closed prop list without spreading
                  the rest, so Radix's Slot-merged role, tabIndex and keyboard
                  wiring would be dropped before reaching an element. The
                  mechanism is written up at RowActions' ItemFor. */}
              <DropdownMenuItem asChild>
                <Link to="/events/new">{t("events.add")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/events/new/series">{t("events.addSeries")}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
```

Note the wrapping `<div className="flex flex-wrap gap-tight">` at line 328 goes with the pair: one control needs no flex row. Keep the outer `mayManage` conditional and the heading row's own `div` at line 324 exactly as they are.

- [ ] **Step 7: Run the whole Events suite**

```bash
npm run typecheck
npx vitest run web/src/pages/Events.test.tsx
```

Expected: every test passes. Pay attention to the three `expectNoSuchAction` call sites — they assert `overflowTriggers()` is empty and run as `demo.player` and `demo.committee`, neither of whom holds `events.manage`, so no page-level trigger renders for them. **If any of those three now fails, the spec's claim was wrong** and the helper needs to distinguish the page trigger from the row triggers; say so rather than loosening the assertion.

- [ ] **Step 8: Check `ButtonLink` is still imported and used**

```bash
grep -n "ButtonLink" web/src/pages/Events.tsx
```

If the two create links were its only use in this file, remove the now-unused import — `npm run lint:js` will fail on it otherwise. If it is still used elsewhere in the file, leave it.

- [ ] **Step 9: Commit**

```bash
git status --short   # package-lock.json must NOT be listed
git add web/src/pages/Events.tsx web/src/pages/Events.test.tsx web/src/i18n/fr.ts web/src/i18n/de.ts
git commit -m "feat(web): the planning's two create controls move behind one trigger

103px fits beside the 170px heading and 175px does not, so collapsing the pair
removes their whole row: the control block goes from two rows and 104px to one
and 44px, and the first event card moves from y=337 to y=287 at 390x844.

The menu items keep their full labels, so events.emptyHint still quotes the key
it renders and a menu item still stands alone for a screen reader.

Also rewrites the negative assertion that this change would have made vacuous —
both create links leave the DOM until the menu opens, so the old queryByRole
would have passed for an organiser too. Matched by aria-haspopup rather than by
a French name, and watched failing with the mayManage gate removed.

#182"
```

---

### Task 4: The browser guard and the measured close

The jsdom suite cannot see layout, and this issue is entirely about layout. This task is what actually closes it.

**Files:**
- Modify (test): `web/e2e/members.spec.ts:136-147` — the `/events` branch of the overflow test

**Interfaces:**
- Consumes: the finished screens from Tasks 2 and 3. Produces nothing other tasks read.

**Read first:** `web/e2e/members.spec.ts:100-147`, including the two comments explaining *logged in first, then narrowed* and why the souper's locator uses `:has(> button[...])`.

- [ ] **Step 1: Write the failing assertion**

In `web/e2e/members.spec.ts`, inside the existing `for (const path of [...])` loop, extend the `if (path === "/events")` block that holds #118's souper guard. Add after it:

```ts
      // THE POINT OF #182, and the only thing standing between it and a silent
      // regression. The saving is one adjacency — a 103px trigger beside a
      // 170px heading — and if it ever stops holding, the row simply wraps
      // back and no test, type error or lint says a word.
      //
      // MEASURED AS THE HEADING'S OWN ROW, not as the trigger: a wrapped
      // trigger is still 44px tall, and it is the ROW that grows to 104px.
      const headingRow = page.locator("h1").locator("..");
      const headingBox = await headingRow.boundingBox();
      expect(
        headingBox?.height,
        "the heading and the Ajouter trigger no longer share one line",
      ).toBeLessThanOrEqual(48);

      // AND THE RESULT OF IT, which is the number #182 is closed on. 287 when
      // this was written; the bound leaves room for a font or a heading change
      // without pinning a pixel.
      const firstCardTop = await page
        .getByTestId("event-card")
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
      expect(firstCardTop, "the control block above the first card has grown").toBeLessThan(300);

      // THE 44px FLOOR, MEASURED, which is the only place it can be. The jsdom
      // suite can see that `min-h-touch` is in a className and nothing more —
      // not a misspelt token, not a missing --spacing-touch, not a later class
      // winning the cascade. Both halves of the new switch are controls a thumb
      // has to hit on the phone this whole issue is about.
      for (const name of ["Planning", "Passés"]) {
        const box = await page.getByRole("radio", { name }).boundingBox();
        expect(box?.height, `the "${name}" segment is under the 44px floor`).toBeGreaterThanOrEqual(
          44,
        );
      }

      // THE ARROW KEY SELECTS, which is the entire reason RadioGroup was chosen
      // over ToggleGroup — that one emits role="radio" and then never selects on
      // an arrow at all. It cannot be asserted in jsdom, because Radix selects
      // by calling click() from the item's onFocus while an arrow is held and
      // that needs real focus events. So the reason for the primitive is
      // guarded here or nowhere.
      await page.getByRole("radio", { name: "Planning" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "Passés" })).toBeChecked();
      // And the list below genuinely changed, not just the control.
      await expect(page.getByRole("heading", { level: 2, name: "Événements passés" })).toBeVisible();

      // Back, so the rest of the loop measures the upcoming view it expects.
      await page.getByRole("radio", { name: "Planning" }).click();
```

- [ ] **Step 2: Run it against the finished screens**

```bash
npx playwright test web/e2e/members.spec.ts -g "no horizontal overflow"
```

Expected: PASS. In this environment Playwright needs the pre-installed browser rather than a download — if it reports a missing executable, do NOT run `npx playwright install`; see the environment note about `/opt/pw-browsers` and `executablePath`.

- [ ] **Step 3: Prove it is a guard by making it fail**

Temporarily put the full label back — in `Events.tsx`, change `{t("events.addTrigger")}` to `{t("events.add")}` — and re-run Step 2.

Expected: FAIL on "the heading and the Ajouter trigger no longer share one line", because 175px + 170px + 16px exceeds 358px and the row wraps to 104px. Revert the label.

- [ ] **Step 4: Take the closing evidence**

The issue asks for measurements and the spec asks for two screenshots. At 390x844 on the mocked stack, as `demo.direction` and as `demo.player`, record: the control block's height, the first card's `top`, the count of cards fully above 844, and `scrollWidth - clientWidth`. Expected, from the spec:

| | `demo.direction` | `demo.player` |
| --- | --- | --- |
| control block | 44px (was 104px) | 44px |
| first card top | 287 (was 337) | 355 (was 353) |
| cards fully above the fold | 2 (was 2) | 2 (was 2) |
| `scrollWidth - clientWidth` | 0 | 0 |

If a measured number disagrees with this table, the table is what is wrong — report the real one. Save both screenshots for the PR.

- [ ] **Step 5: Run the full gate**

```bash
npm run check
```

Expected: every step green. `lint:types` prints a notice and exits 0 in a web session, which means **no PHP was type-checked** — that is fine here because no PHP changed.

- [ ] **Step 6: Commit**

```bash
git status --short   # package-lock.json must NOT be listed
git add web/e2e/members.spec.ts
git commit -m "test(e2e): pin the planning's control block to one row at 390px

Measures #182's closing condition in a real browser rather than trusting the
jsdom suite, beside #118's souper guard in the same test: the heading's row
stays one line, and the first event card starts above y=300.

The one-adjacency saving has no other guard — if the trigger stops fitting
beside the heading the row silently wraps back to 104px and nothing else in the
suite notices. Watched failing with the full label restored.

#182"
```

---

## Self-Review

**Spec coverage.** §1 the add control → Task 3. §2 the view switch, its keys, the deleted keys, the re-pointed comment, the radiogroup name and why it is `RadioGroup` rather than `ToggleGroup` → Tasks 1 and 2. The spec's empty-value guard is gone rather than unimplemented: a radio group cannot be cleared, which Task 1's third test proves and Task 2's screen-level test confirms. §3 what does not change → no task, correctly: the calendar toggle, the day filter, the `past` state's home and `EventCard` are all explicitly out. §4 rejected options → no task by nature. §5 tests: the vacuous assertion → Task 3 Step 2; `expectNoSuchAction` re-confirmation → Task 3 Step 7; the four converted call sites → Task 2 Step 7 (three) and Task 3 Step 4 (one); `radio-group.test.tsx` → Task 1, minus the floor and the arrow key, which jsdom cannot see and which Task 4 measures instead; the e2e guard → Task 4; German parity via `typeof fr` → Task 2 Steps 1 and 3. §6 review focus 1 → Task 4 Step 3; 2 → Task 3 Step 3; 4 → left as a question for review, as the spec says. §7 close it with → Task 4 Step 4.

**Gap found and closed.** §6's review focus 3 — touch, the tap-through case #118's e2e exists for — had no step. It is a review question rather than a new behaviour, and the page-level menu does sit above the first card's own controls. Adding it to Task 4:

- [ ] **Task 4, Step 3b: Check the page-level menu for tap-through**

`web/e2e/members.spec.ts` already has `test("selecting a menu item on a touch phone does not also hit what is under it")` for a row's menu. The page-level trigger sits directly above the first card, so extend that test with the same two taps against the new menu:

```ts
  await page.getByRole("button", { name: "Ajouter au planning" }).tap();
  await page.getByRole("menuitem", { name: "Ajouter une série" }).tap();
  await expect(page).toHaveURL(/\/events\/new\/series$/);
```

Add it to Task 4's commit.

**Placeholder scan.** No TBD, no "add error handling", no "similar to Task N". Every code step carries its code. Task 1 Step 5 asks for a number rather than giving one, deliberately — it is a manual observation whose value Task 4 then asserts.

**Type consistency.** `RadioGroup` / `ToggleOption` are the names Task 1 exports and Task 2 imports — `ToggleOption` rather than Radix's `RadioGroupItem`, because the thing on screen is a segment and a caller reaching for `RadioGroupItem` would reach for a dot and a label with it. `switchView(user, to)` is defined once in Task 2 Step 4 and used at Task 2 Step 7's three sites. `events.addTrigger` and `events.addTriggerAria` are both introduced in Task 3 Step 1 and used in Task 3 Step 6 and Task 4 Step 3b — note the spec's §1 names only `addTrigger`; the `Aria` variant is a second key this plan adds, because WCAG 2.5.3 needs the longer name and a catalogue is where the app's strings live. `events.viewPlanning`, `events.viewPast`, `events.viewSwitchAria` are introduced in Task 2 Step 1 and used in Task 2 Step 6 and its tests. `overflowTriggers()` and `expectNoSuchAction()` are existing helpers, not redefined.
