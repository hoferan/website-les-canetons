# Per-row actions behind an overflow menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wrapping per-row action buttons on three committee screens with one inline action plus a Radix overflow menu, taking the souper card's action row from 148px over three lines to 44px over one.

**Architecture:** A vendored `ui/dropdown-menu.tsx` (Radix, already installed) sits under one new `RowActions` component that owns the inline/menu split, the 44px floor and the accessible naming. Three screens compose with it. `EventCard` is untouched and stays permission-agnostic.

**Tech Stack:** React 19 + TypeScript, Radix (`radix-ui` ^1.6.7 meta-package), Tailwind 4, `lucide-react`, Vitest + Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-21-row-actions-overflow-menu-design.md`](../specs/2026-09-21-row-actions-overflow-menu-design.md)

**Issue:** [#118](https://github.com/hoferan/website-les-canetons/issues/118). Branch `feat/row-actions-overflow-menu`, already cut from `main`, carrying the spec commits.

## Global Constraints

- **No new npm package.** `radix-ui` ^1.6.7 is a direct dependency and `@radix-ui/react-dropdown-menu` is installed as its transitive. Import from `"radix-ui"`, exactly as `ui/alert-dialog.tsx` does.
- **44px touch floor** (`--spacing-touch: 2.75rem`). The `icon-*` size variants in `ui/button.tsx` already carry `min-w-touch`; do not reintroduce a bare `size-8`.
- **No `dark:` utility, ever**, in anything vendored into `web/src/components/ui/`. Read the docblock at the top of `ui/button.tsx` before writing a class string — it explains why, and why you must not even spell one out in a comment.
- **Never the `disabled` attribute on a `<button>`** in app code: this app uses `aria-disabled` plus an early return. Radix `MenuItem`'s own `disabled` prop is different and IS used — it drives roving focus and typeahead skipping, and Radix renders `data-disabled` rather than the HTML attribute.
- **Every new UI string exists in `web/src/i18n/fr.ts` AND `web/src/i18n/de.ts`.** `web/src/i18n/catalogues.test.ts` fails on a key in one and not the other, and `de.ts` is typed `typeof fr` so it is a typecheck failure first.
- **Interpolation is i18next double-brace**: `{{title}}`, not `{title}`.
- **Every per-row control's accessible name carries the event's or person's name.** See the docblock at `web/src/pages/Members.tsx:490-501`.
- **English everywhere except rendered UI text.** Identifiers, comments, test names in English; only the French and German strings are user-facing.
- Run `npm run check` from **PowerShell**, not Git Bash — Vitest 4 misresolves from a lowercase drive letter and reports a phantom 29-file failure.

## Review Focus

Five things the spec implies, that no task's own happy-path tests would exercise, most likely to bite first. Each has a test assigned to the task that owns the code.

1. **A row whose action list is empty.** `Events.tsx` only passes `actions` when some permission holds, but `RowActions` is a shared component and the next screen will not be so careful. Expect: renders nothing at all, no stray trigger. → Task 2, Step 9.
2. **A row with exactly two actions.** The spec's rule 3 says "one action in total", but its own registrations row has two and is described as "two inline". A literal reading produces a one-item menu on the screen the spec says must not have one. Resolved in Task 2 as *fewer than two menu items → everything inline*. → Task 2, Step 7.
3. **A link-shaped action promoted inline.** Rules 2 and 3 can promote an action declared with `to` rather than `onSelect`. Expect: a `ButtonLink`, keeping the router and the locale basename, not a `<button>` that navigates. → Task 2, Step 11.
4. **A disabled item reached by keyboard rather than pointer.** `MemberActions` disables edit and delete while a mutation is in flight. Radix skips disabled items in arrow navigation and typeahead; the handler must still early-return if one is somehow activated. → Task 4, Step 5.
5. **The dialog opened from a menu item.** The whole of spec §3. Expect: the field accepts typing, on Chrome and not only in jsdom. → Task 3, Step 11 (jsdom) and Task 6, Step 3 (Playwright).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `web/src/components/ui/dropdown-menu.tsx` | **new.** Radix vendoring only: Root, Trigger, Portal, Content, Item, Separator. No app logic. |
| `web/src/components/RowActions.tsx` | **new.** The inline/menu split, the promotion rule, accessible naming, `textValue`. The only file that knows the pattern. |
| `web/src/components/RowActions.test.tsx` | **new.** The rule, in isolation from any screen. |
| `web/src/i18n/fr.ts`, `web/src/i18n/de.ts` | one new key, `events.moreActionsAria`. |
| `web/src/pages/Events.tsx` | five call sites become one `RowActions`. |
| `web/src/pages/Members.tsx` | `MemberActions` becomes a `RowActions` caller; `variant="destructive"` goes. |
| `web/src/pages/EventRegistrations.tsx` | `BookingActions` becomes a `RowActions` caller (two inline, no menu). |
| `web/src/pages/*.test.tsx` | the negative permission assertions, rewritten against the open menu. |
| `web/e2e/members.spec.ts` | the 390px measurement and the touch case. |

`web/src/events/EventCard.tsx` is **not** in this list and must not be edited.

---

### Task 1: The `dropdown-menu` primitive

**Files:**
- Create: `web/src/components/ui/dropdown-menu.tsx`
- Create: `web/src/components/ui/dropdown-menu.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; the `radix-ui` meta-package.
- Produces: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuPortal`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`. All are `React.ComponentProps<typeof Primitive.X>` passthroughs with a `data-slot` and a class.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/ui/dropdown-menu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function Harness({ onPick = () => {} }: { onPick?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Autres actions">…</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onPick}>Premier</DropdownMenuItem>
        <DropdownMenuItem>Second</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("opens from the trigger and closes on Escape, returning focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Autres actions" });
    await user.click(trigger);

    expect(await screen.findByRole("menuitem", { name: "Premier" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menuitem", { name: "Premier" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("moves through items with the arrow keys and selects with Enter", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: "Autres actions" }));
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "Premier" })).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
```

Add `vi` to the vitest import line: `import { describe, expect, it, vi } from "vitest";`

- [ ] **Step 2: Run it and watch it fail**

Run from PowerShell:

```bash
npx vitest run web/src/components/ui/dropdown-menu.test.tsx
```

Expected: FAIL, `Failed to resolve import "./dropdown-menu"`.

- [ ] **Step 3: Write the primitive**

Create `web/src/components/ui/dropdown-menu.tsx`:

```tsx
import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * VENDORED from shadcn/ui and trimmed, the same way ui/alert-dialog.tsx is.
 *
 * SIX PARTS AND NO MORE. No submenus, no checkbox or radio items, no groups,
 * no labels: each is a surface that has to keep working across three screens
 * and two catalogues, and none of them is needed today. A later screen that
 * wants one adds it then.
 *
 * NO `dark:` UTILITY, for the reason ui/button.tsx sets out at length: this
 * app declares no `dark` custom variant, so Tailwind 4 compiles one to a
 * prefers-color-scheme media query that fires on any phone set to dark.
 *
 * `modal` DEFAULTS TO FALSE HERE, unlike Radix. A menu of four items over a
 * card has no reason to mark the rest of the page aria-hidden (hideOthers),
 * mount a second RemoveScroll, or add a second focus trap and a second entry
 * to DismissableLayer's body-lock refcount — all of which the modal branch
 * does, and all of which have to unwind in the right order around the
 * AlertDialog these menus open. It is NOT a fix for a focus bug: the design
 * measured that path and there is no bug. See §3 of the spec.
 */
function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" modal={modal} {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[10rem] overflow-hidden rounded-md border bg-background p-1 shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    </DropdownMenuPortal>
  );
}

function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-destructive={destructive || undefined}
      className={cn(
        // min-h-touch, not a height: the 44px floor is the same one
        // ui/button.tsx puts on every control, and a menu item is a control.
        "relative flex min-h-touch cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[destructive]:text-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx vitest run web/src/components/ui/dropdown-menu.test.tsx
```

Expected: PASS, 2 tests. If it fails on `ResizeObserver is not defined`, you have added an `Arrow` — remove it; `§1` of the spec excludes it precisely so jsdom needs no new stub.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/dropdown-menu.tsx web/src/components/ui/dropdown-menu.test.tsx
git commit -m "feat(web): vendor a dropdown-menu primitive from radix"
```

---

### Task 2: `RowActions` and its rule

**Files:**
- Create: `web/src/components/RowActions.tsx`
- Create: `web/src/components/RowActions.test.tsx`
- Modify: `web/src/i18n/fr.ts` (beside `events.deleteAria`, around line 553)
- Modify: `web/src/i18n/de.ts` (beside `events.deleteAria`, around line 338)

**Interfaces:**
- Consumes: Task 1's exports; `Button` from `@/components/ui/button`; `ButtonLink` from `@/components/ButtonLink`; `t` from `../i18n`.
- Produces:

```ts
export type RowAction = {
  key: string;
  /** Visible text. Also the item's typeahead value. */
  label: string;
  /** The full accessible name, carrying the row's own name. */
  ariaLabel: string;
  /** Exactly one of these two. */
  onSelect?: () => void;
  to?: string;
  disabled?: boolean;
  destructive?: boolean;
};

export function RowActions(props: {
  actions: RowAction[];
  /** `key` of the action that should stay inline when present. */
  inlineKey: string;
  /** Accessible name for the ... trigger, carrying the row's own name. */
  triggerLabel: string;
}): React.ReactElement | null;
```

**A correction to the spec, applied here.** §5 rule 3 reads "If **one** action remains in total, it renders inline and there is no menu at all", but the same section says `/events/{id}/registrations`, which has *two* actions, renders as two inline controls. Taken literally, rule 3 would give that screen the one-item menu the spec spends a paragraph rejecting. The rule implemented here is therefore: **if the menu would hold fewer than two items, every action renders inline and no trigger is drawn.** That satisfies both of the spec's stated outcomes.

- [ ] **Step 1: Add the trigger's key to both catalogues**

In `web/src/i18n/fr.ts`, immediately after `deleteAria: "Supprimer {{title}}",`:

```ts
    moreActionsAria: "Autres actions pour {{title}}",
```

In `web/src/i18n/de.ts`, immediately after `deleteAria: "{{title}} löschen",`:

```ts
    moreActionsAria: "Weitere Aktionen zu {{title}}",
```

`zu` rather than `für`, matching `registrationsAria: "Anmeldungen zu {{title}}"` two lines above it.

- [ ] **Step 2: Run the catalogue guard**

```bash
npx vitest run web/src/i18n/catalogues.test.ts
```

Expected: PASS. If it fails, one of the two edits landed in the wrong nesting level.

- [ ] **Step 3: Write the failing tests for the split**

Create `web/src/components/RowActions.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RowActions, type RowAction } from "./RowActions";

function show(actions: RowAction[], inlineKey = "first") {
  return render(
    <MemoryRouter>
      <RowActions actions={actions} inlineKey={inlineKey} triggerLabel="Autres actions pour X" />
    </MemoryRouter>,
  );
}

const action = (key: string, over: Partial<RowAction> = {}): RowAction => ({
  key,
  label: key,
  ariaLabel: `${key} X`,
  onSelect: () => {},
  ...over,
});

describe("RowActions", () => {
  it("keeps the designated action inline and puts the rest behind the trigger", async () => {
    const user = userEvent.setup();
    show([action("first"), action("second"), action("third")]);

    expect(screen.getByRole("button", { name: "first X" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "second X" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));

    expect(await screen.findByRole("menuitem", { name: "second X" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "third X" })).toBeInTheDocument();
  });

  it("promotes the first remaining action when the designated one is absent", () => {
    show([action("second"), action("third")], "first");

    expect(screen.getByRole("button", { name: "second X" })).toBeInTheDocument();
  });

  it("draws no trigger when the menu would hold fewer than two items", () => {
    show([action("first"), action("second")]);

    expect(screen.getByRole("button", { name: "first X" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "second X" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Autres actions pour X" })).not.toBeInTheDocument();
  });

  it("renders a single action inline with no trigger", () => {
    show([action("only")], "absent");

    expect(screen.getByRole("button", { name: "only X" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Autres actions pour X" })).not.toBeInTheDocument();
  });

  it("renders nothing at all for an empty list", () => {
    const { container } = show([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("gives a link-shaped action a real link, inline and in the menu", async () => {
    const user = userEvent.setup();
    show([action("first", { onSelect: undefined, to: "/somewhere" }), action("b"), action("c")]);

    expect(screen.getByRole("link", { name: "first X" })).toHaveAttribute("href", "/somewhere");

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));
    // An item that navigates is still a menuitem to assistive tech; Radix
    // renders the child through asChild, so the anchor is inside it.
    const item = await screen.findByRole("menuitem", { name: "b X" });
    expect(item).toBeInTheDocument();
  });

  it("does not fire a disabled item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    show([action("first"), action("second", { onSelect, disabled: true }), action("third")]);

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));
    await user.click(await screen.findByRole("menuitem", { name: "second X" }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("types ahead on the visible label, not the accessible name", async () => {
    const user = userEvent.setup();
    show([action("first"), action("alpha"), action("beta")]);

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));
    await user.keyboard("b");

    expect(screen.getByRole("menuitem", { name: "beta X" })).toHaveFocus();
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

```bash
npx vitest run web/src/components/RowActions.test.tsx
```

Expected: FAIL, `Failed to resolve import "./RowActions"`.

- [ ] **Step 5: Write `RowActions`**

Create `web/src/components/RowActions.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis } from "lucide-react";

import { ButtonLink } from "./ButtonLink";

/**
 * One row's actions: the frequent one inline, the rest behind a "..." menu.
 *
 * WHY A MENU AND NOT ICONS. All three candidates measured identically at
 * 390px — one 44px line, the souper's card 388px -> 284px — so the choice was
 * never about space. The menu is the only one that answers the FREQUENCY
 * mismatch instead of compressing it: five identical icon squares give
 * "Qui vient ?", opened weekly, the same weight as "Supprimer", used twice a
 * season. See #118.
 *
 * THE SCREEN DECIDES WHICH ACTIONS EXIST; this decides how they are laid out.
 * It never calls can() — EventCard's docblock explains why that separation is
 * load-bearing, and the same reasoning applies here.
 *
 * THE MENU NEEDS TWO ITEMS TO EXIST. A single item behind a "..." is a tap to
 * reveal a button, which is worse than the button. That is why this counts
 * what would be left rather than trusting a fixed inline slot: three
 * permissions gate the planning's actions independently, so demo.committee —
 * registrations.view and nothing else — reaches the souper with one action
 * and would otherwise get a bare "..." over it.
 */
export type RowAction = {
  key: string;
  /** Visible text. Also the item's typeahead value. */
  label: string;
  /** The full accessible name, carrying the row's own name. */
  ariaLabel: string;
  /** Exactly one of these two. */
  onSelect?: () => void;
  to?: string;
  disabled?: boolean;
  destructive?: boolean;
};

export function RowActions({
  actions,
  inlineKey,
  triggerLabel,
}: {
  actions: RowAction[];
  inlineKey: string;
  triggerLabel: string;
}) {
  if (actions.length === 0) {
    return null;
  }

  // The designated one if the screen passed it, otherwise whatever came
  // first: rules 1 and 2 of the spec's §5.
  const inlineIndex = Math.max(
    0,
    actions.findIndex((a) => a.key === inlineKey),
  );
  const inline = actions[inlineIndex];
  const rest = actions.filter((_, i) => i !== inlineIndex);

  // Fewer than two items is not a menu. Everything goes inline and no trigger
  // is drawn; the row still fits, because two text buttons were what these
  // screens had before.
  const inMenu = rest.length >= 2 ? rest : [];
  const alsoInline = rest.length >= 2 ? [] : rest;

  return (
    <div className="flex flex-wrap gap-tight">
      {[inline, ...alsoInline].map((a) => (
        <InlineAction key={a.key} action={a} />
      ))}

      {inMenu.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label={triggerLabel}>
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {inMenu.map((a, i) => (
              <ItemFor key={a.key} action={a} first={i === 0} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function InlineAction({ action }: { action: RowAction }) {
  if (action.to !== undefined) {
    return (
      <ButtonLink to={action.to} variant="outline" ariaLabel={action.ariaLabel}>
        {action.label}
      </ButtonLink>
    );
  }

  // aria-disabled and an early return, never the disabled attribute: see the
  // docblock in ui/button.tsx.
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={action.ariaLabel}
      aria-disabled={action.disabled}
      onClick={() => {
        if (action.disabled) return;
        action.onSelect?.();
      }}
    >
      {action.label}
    </Button>
  );
}

function ItemFor({ action, first }: { action: RowAction; first: boolean }) {
  // textValue EXPLICITLY, because Radix otherwise derives typeahead from
  // textContent — and aria-label is what carries the row's name, so without
  // this a reader typing "s" would be matching against the visible label
  // while a screen reader announces the long one. Keeping them separate is
  // the point; keeping typeahead on the SHORT one is what this line does.
  const common = {
    textValue: action.label,
    disabled: action.disabled,
    destructive: action.destructive,
    "aria-label": action.ariaLabel,
  };

  const item =
    action.to !== undefined ? (
      <DropdownMenuItem {...common} asChild>
        <ButtonLink to={action.to} variant="ghost" ariaLabel={action.ariaLabel}>
          {action.label}
        </ButtonLink>
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem {...common} onSelect={() => action.onSelect?.()}>
        {action.label}
      </DropdownMenuItem>
    );

  // A separator above the destructive item, unless it is already the first
  // thing in the menu and has nothing to be separated from.
  return action.destructive && !first ? (
    <>
      <DropdownMenuSeparator />
      {item}
    </>
  ) : (
    item
  );
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npx vitest run web/src/components/RowActions.test.tsx
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Mutation-test the two-item rule (Review Focus 2)**

Temporarily change `rest.length >= 2` to `rest.length >= 1` in both places. Re-run.

Expected: `draws no trigger when the menu would hold fewer than two items` FAILS. Restore the `>= 2`, re-run, confirm green. A rule nobody has watched fail is not a guard.

- [ ] **Step 8: Mutation-test the promotion rule**

Temporarily replace the `Math.max(0, ...)` with a bare `actions.findIndex(...)`. Re-run.

Expected: `promotes the first remaining action when the designated one is absent` FAILS, because `-1` indexes nothing. Restore, re-run, confirm green.

- [ ] **Step 9: Confirm the empty-list case is covered (Review Focus 1)**

The test `renders nothing at all for an empty list` is already in Step 3. Verify it fails when you delete the `actions.length === 0` early return: it should, because the `[inline, ...alsoInline]` map would throw on `undefined`. Restore.

- [ ] **Step 10: Mutation-test `textValue` (Review Focus, typeahead)**

Delete `textValue: action.label` from `common`. Re-run.

Expected: `types ahead on the visible label, not the accessible name` FAILS, because typeahead falls back to `textContent`. Restore.

- [ ] **Step 11: Confirm the link case (Review Focus 3)**

The test `gives a link-shaped action a real link, inline and in the menu` is already in Step 3 and covers it. Confirm it is green.

- [ ] **Step 12: Commit**

```bash
git add web/src/components/RowActions.tsx web/src/components/RowActions.test.tsx web/src/i18n/fr.ts web/src/i18n/de.ts
git commit -m "feat(web): one component for a row's actions, inline plus overflow"
```

---

### Task 3: The planning

**Files:**
- Modify: `web/src/pages/Events.tsx:188-236` (the `actions` prop passed to `EventCard`)
- Modify: `web/src/pages/Events.test.tsx` — assertions at 139, 157, 169, 180, 209, 566, 594, 595, 801

**Interfaces:**
- Consumes: `RowActions`, `RowAction` from Task 2.
- Produces: nothing other tasks read.

- [ ] **Step 1: Rewrite the `actions` prop**

In `web/src/pages/Events.tsx`, replace the whole `actions={...}` expression on the `EventCard` with:

```tsx
        actions={(() => {
          const actions: RowAction[] = [];

          if (maySeeAnswers) {
            actions.push({
              key: "attendance",
              label: t("attendance.heading"),
              ariaLabel: t("events.whoComingAria", { title: event.title }),
              to: `/events/${event.id}/attendance`,
            });
          }

          // ONLY ON AN EVENT THAT TAKES BOOKINGS. Every other card would
          // otherwise carry a link to an empty list that can never fill up,
          // and the planning is mostly rehearsals.
          if (maySeeGuests && event.takesRegistrations) {
            actions.push({
              key: "registrations",
              label: t("events.registrations"),
              ariaLabel: t("events.registrationsAria", { title: event.title }),
              to: `/events/${event.id}/registrations`,
            });
          }

          if (mayManage) {
            actions.push(
              {
                key: "options",
                label: t("events.options"),
                ariaLabel: t("events.optionsAria", { title: event.title }),
                to: `/events/${event.id}/registration-options`,
              },
              {
                key: "edit",
                label: t("common.edit"),
                ariaLabel: t("events.editAria", { title: event.title }),
                to: `/events/${event.id}/edit`,
              },
              {
                key: "delete",
                label: t("common.delete"),
                ariaLabel: t("events.deleteAria", { title: event.title }),
                disabled: opening === event.id,
                destructive: true,
                onSelect: () => void openDelete(event),
              },
            );
          }

          return actions.length > 0 ? (
            <RowActions
              actions={actions}
              // The weekly one. When the reader does not hold
              // attendance.view_all it is simply absent and RowActions
              // promotes whatever is first — see its docblock.
              inlineKey="attendance"
              triggerLabel={t("events.moreActionsAria", { title: event.title })}
            />
          ) : null;
        })()}
```

Add the import: `import { RowActions, type RowAction } from "@/components/RowActions";`

Remove the now-unused `ButtonLink` import **only if** nothing else in the file uses it — check with `grep -n "ButtonLink" web/src/pages/Events.tsx` first. The page-level buttons still do.

- [ ] **Step 2: Run the suite and read the damage**

```bash
npx vitest run web/src/pages/Events.test.tsx
```

Expected: several FAIL. The positive assertions fail loudly because the items are portalled out of the card and their role is now `menuitem`. **Do not fix them by loosening the query.** Work through Steps 3 to 8.

- [ ] **Step 3: Add an opener helper to the test file**

Near the top of `web/src/pages/Events.test.tsx`, after the imports:

```tsx
/**
 * Open one card's overflow menu and return a scope to query inside.
 *
 * WHY THIS EXISTS RATHER THAN A BARE getByRole. A Radix item is portalled to
 * document.body, so `within(card)` cannot see it and a page-wide query cannot
 * tell two cards apart. Opening by the trigger's own accessible name — which
 * carries the event title — is the only scoping that survives the move.
 */
async function openMenuFor(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole("button", { name: `Autres actions pour ${title}` }));
  return screen.findByRole("menu");
}
```

- [ ] **Step 4: Rewrite the positive assertions (139, 157, 180, 209, 801)**

Each currently reads like:

```tsx
within(card).getByRole("button", { name: `Supprimer ${title}` })
```

Replace with:

```tsx
const menu = await openMenuFor(user, title);
within(menu).getByRole("menuitem", { name: `Supprimer ${title}` });
```

The test's function must become `async` if it is not already, and it needs `const user = userEvent.setup();`.

- [ ] **Step 5: Rewrite the four negative assertions on this page (169, 566, 594, 595)**

**This is the step the whole task exists for.** Each of these currently asserts a control is absent, and after Step 1 they would pass whether or not the permission is checked, because a closed menu contains nothing.

Line 169, the player who may not delete:

```tsx
  // NO MENU AT ALL for a player: the screen passes no actions, so there is no
  // trigger to open. Asserting the trigger's absence is what makes this fail
  // if the permission gate goes — a queryByRole for the item itself would
  // pass on a closed menu and tell us nothing.
  expect(
    screen.queryByRole("button", { name: /^Autres actions pour/ }),
  ).toBeNull();
  expect(screen.queryByRole("menuitem", { name: /^Supprimer/ })).toBeNull();
```

Lines 566, 594 and 595 are the cases where the reader HAS some actions but not others, so a trigger does exist and must be opened:

```tsx
  const menu = await openMenuFor(user, "Répétition");
  expect(within(menu).queryByRole("menuitem", { name: /^Inscriptions à Répétition/ })).toBeNull();
```

and the same shape for `/^Ce qui peut être réservé/` and `/^Modifier/`.

- [ ] **Step 6: Mutation-test all four (Critical finding from review)**

One at a time, remove the permission gate that the assertion guards — for line 566 that is the `maySeeGuests && event.takesRegistrations` condition in Step 1 — and run the file.

Expected: that assertion FAILS. Restore the gate, re-run, confirm green. Repeat for each of the four.

**If an assertion stays green with its gate removed, it is not yet a guard and Step 5 is not finished for that line.**

- [ ] **Step 7: Keep the inline assertion honest (596)**

`/^Qui vient/` at line 596 stays as it is — that action is inline, so a page-wide `queryByRole("link", ...)` still means what it meant. Confirm it is untouched and green, and add a one-line comment saying why it did not move:

```tsx
  // STILL A PAGE-WIDE QUERY, unlike the four above: this action is the inline
  // one, so it is in the DOM whenever it exists at all.
```

- [ ] **Step 8: Add the German rendering assertion**

Beside the existing German block at `Events.test.tsx:799-801`:

```tsx
  const menu = await openMenuFor(user, "Probe");
  expect(within(menu).getByRole("menuitem", { name: "Probe bearbeiten" })).toBeInTheDocument();
```

and the trigger itself, which in German reads `Weitere Aktionen zu Probe`. Adjust the opener helper to take the whole trigger name rather than building the French one, or add a German-specific call — whichever keeps the helper readable.

- [ ] **Step 9: Run the file green**

```bash
npx vitest run web/src/pages/Events.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Add the dialog-from-menu test (Review Focus 5, jsdom half)**

In `web/src/pages/Events.test.tsx`:

```tsx
it("opens the delete dialog from the menu, and the dialog can be typed into", async () => {
  const user = userEvent.setup();
  // ... render as the other manage-capable tests do
  const menu = await openMenuFor(user, "Souper de soutien");
  await user.click(within(menu).getByRole("menuitem", { name: /^Supprimer/ }));

  const dialog = await screen.findByRole("alertdialog");
  const field = within(dialog).getByRole("textbox");
  await user.type(field, "Souper de soutien");

  expect(field).toHaveValue("Souper de soutien");
});
```

- [ ] **Step 11: Mutation-test the load-bearing rule (spec §3)**

Temporarily move the `<ConfirmByTypingName .../>` element in `Events.tsx` so that it renders *inside* `DropdownMenuContent` (pass it as a child of the menu rather than leaving it at the screen level). Run the file.

Expected: the Step 10 test FAILS — `findByRole("alertdialog")` times out, because the menu's own close unmounts the dialog before it can appear. Restore, re-run, confirm green.

This is the mutation the spec names. Flipping `modal` is **not** it; §3 explains why it cannot fail.

- [ ] **Step 12: Commit**

```bash
git add web/src/pages/Events.tsx web/src/pages/Events.test.tsx
git commit -m "feat(web): the planning's row actions move behind an overflow menu"
```

---

### Task 4: The roster

**Files:**
- Modify: `web/src/pages/Members.tsx:514-548` (`MemberActions`)
- Modify: `web/src/pages/Members.test.tsx` — assertions at 249, 266, 283, 297, 319, 359, 373

**Interfaces:**
- Consumes: `RowActions`, `RowAction` from Task 2.

- [ ] **Step 1: Rewrite `MemberActions`**

Replace the body of `MemberActions` in `web/src/pages/Members.tsx`:

```tsx
function MemberActions({
  member,
  busy,
  onEdit,
  onDelete,
  onResetPassword,
}: {
  member: MemberResource;
  busy: boolean;
  onEdit: (member: MemberResource) => void;
  onDelete: (member: MemberResource) => void;
  onResetPassword: (member: MemberResource) => void;
}) {
  const name = `${member.firstName} ${member.lastName}`;

  const actions: RowAction[] = [
    {
      key: "edit",
      label: t("common.edit"),
      ariaLabel: t("members.editPerson", { name }),
      disabled: busy,
      onSelect: () => void onEdit(member),
    },
    {
      key: "password",
      label: t("members.password"),
      // THE SAME KEY AS THE DIALOG THIS OPENS, so the item's accessible name
      // and the dialog's title cannot come to disagree.
      ariaLabel: t("members.resetTitle", { name }),
      onSelect: () => onResetPassword(member),
    },
    {
      key: "delete",
      label: t("common.delete"),
      ariaLabel: t("members.deleteTitle", { name }),
      disabled: busy,
      // NOT variant="destructive" any more. A filled red block was the most
      // prominent thing on the card, above the person's own name, for an
      // action taken a handful of times a season — and the planning rendered
      // the same action as an outline button, so one action had two answers
      // (#118). ConfirmByTypingName is the actual guard.
      destructive: true,
      onSelect: () => void onDelete(member),
    },
  ];

  return (
    <RowActions
      actions={actions}
      inlineKey="edit"
      triggerLabel={t("events.moreActionsAria", { title: name })}
    />
  );
}
```

Add `import { RowActions, type RowAction } from "@/components/RowActions";`

**On the trigger key.** `events.moreActionsAria` interpolates `{{title}}` and is being handed a person's name. That reads correctly in both languages ("Autres actions pour Perrine Player" / "Weitere Aktionen zu Perrine Player") and one key beats two that must stay in step. If a reviewer objects, the alternative is a `common.moreActionsAria` in both catalogues; do not add a third.

- [ ] **Step 2: Run the file and read the damage**

```bash
npx vitest run web/src/pages/Members.test.tsx
```

Expected: several FAIL on `within(rowFor(...)).getByRole("button", ...)`.

- [ ] **Step 3: Rewrite the queries**

Same shape as Task 3, Step 4, with the roster's opener:

```tsx
async function openMenuFor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Autres actions pour ${name}` }));
  return screen.findByRole("menu");
}
```

`Modifier` stays a page-level `getByRole("button", { name: "Modifier Perrine Player" })` because it is the inline action. `Mot de passe` and `Supprimer` move inside the menu.

- [ ] **Step 4: Run it green**

```bash
npx vitest run web/src/pages/Members.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add the keyboard-disabled test (Review Focus 4)**

```tsx
it("does not delete while a mutation is in flight, by keyboard either", async () => {
  const user = userEvent.setup();
  // ... render with a member whose row is busy
  await user.click(screen.getByRole("button", { name: /^Autres actions pour Perrine/ }));

  // Radix skips a disabled item in roving focus, so ArrowDown lands past it.
  await user.keyboard("{ArrowDown}{ArrowDown}");

  expect(screen.getByRole("menuitem", { name: /^Supprimer Perrine/ })).not.toHaveFocus();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Confirm the red variant is gone**

```bash
grep -n 'variant="destructive"' web/src/pages/Members.tsx
```

Expected: no output. If a line remains, it is a second call site the spec did not account for — stop and report it rather than deleting it blind.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/Members.tsx web/src/pages/Members.test.tsx
git commit -m "feat(web): the roster's row actions move behind an overflow menu"
```

---

### Task 5: The guest list

**Files:**
- Modify: `web/src/pages/EventRegistrations.tsx:440-475` (`BookingActions`)
- Modify: `web/src/pages/EventRegistrations.test.tsx:114` and `:440`

**Interfaces:**
- Consumes: `RowActions`, `RowAction` from Task 2.

This screen has two actions, so by Task 2's rule both render inline and **no trigger is drawn**. The visible result is unchanged; the point is that the screen stops carrying its own copy of the pattern.

- [ ] **Step 1: Rewrite `BookingActions`**

```tsx
  const who = `${booking.firstName} ${booking.lastName}`;

  const actions: RowAction[] = [
    {
      key: "amend",
      label: t("registrations.amend"),
      ariaLabel: t("registrations.amendTitle", { name: who }),
      disabled: busy,
      onSelect: onAmend,
    },
    {
      key: "cancel",
      // registrations.cancel, NOT common.cancel: this one cancels a BOOKING
      // ("stornieren"), the other closes a form without doing anything
      // ("abbrechen"). One French word, two German ones.
      label: t("registrations.cancel"),
      ariaLabel: t("registrations.cancelAria", { name: who }),
      disabled: busy,
      destructive: true,
      onSelect: onCancel,
    },
  ];

  return (
    <RowActions
      actions={actions}
      inlineKey="amend"
      triggerLabel={t("events.moreActionsAria", { title: who })}
    />
  );
```

The wrapper was a `<span className="mt-tight flex flex-wrap gap-tight">`; `RowActions` renders its own `div` with the same flex and gap, so put the `mt-tight` on the element that contains it rather than losing it.

- [ ] **Step 2: Rewrite the negative assertion at line 114**

It currently reads:

```tsx
expect(screen.queryByRole("button", { name: /^Annuler l’inscription/ })).not.toBeInTheDocument();
```

Both actions are inline here, so this query still means what it meant — but it will stop meaning it the moment a third action arrives and the menu appears. Add the comment that says so:

```tsx
  // STILL A PAGE-WIDE QUERY, and only because this screen has two actions and
  // RowActions therefore draws no menu. A third action turns this into a
  // closed menu and this assertion into a tautology — see #118's spec, §6.
  expect(screen.queryByRole("button", { name: /^Annuler l’inscription/ })).not.toBeInTheDocument();
```

Note the apostrophe in that regex is U+2019, not U+0027. Copy it, do not retype it.

- [ ] **Step 3: Run the file**

```bash
npx vitest run web/src/pages/EventRegistrations.test.tsx
```

Expected: PASS, unchanged, including the German `Stornieren` assertion at line 440.

- [ ] **Step 4: Mutation-test the gate behind line 114**

Remove the permission condition that hides the cancel control and re-run.

Expected: line 114 FAILS. Restore.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/EventRegistrations.tsx web/src/pages/EventRegistrations.test.tsx
git commit -m "feat(web): the guest list's row actions move to the shared component"
```

---

### Task 6: The browser, and the evidence

**Files:**
- Modify: `web/e2e/members.spec.ts` (the overflow guard at 109-138)

**Interfaces:**
- Consumes: nothing from earlier tasks at the code level; exercises all of them.

- [ ] **Step 1: Extend the overflow guard with the row measurement**

In `web/e2e/members.spec.ts`, inside the existing 390px test, after the `/events` overflow assertion:

```ts
    if (path === "/events") {
      // THE POINT OF #118, measured rather than eyeballed. The souper is the
      // widest row there is: five actions for demo.direction. Before this
      // change it wrapped to three lines and 148px.
      const row = page.locator('[data-testid="event-card"]', { hasText: "Souper" }).locator(
        "css=div:has(> button[aria-label^='Autres actions'])",
      );
      const box = await row.boundingBox();
      expect(box?.height, "the souper's action row is more than one line").toBeLessThanOrEqual(48);
    }
```

- [ ] **Step 2: Run it**

```bash
npx playwright test web/e2e/members.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Add the touch case (spec §6, Review Focus 5)**

```ts
test("selecting a menu item on a touch phone does not also hit what is under it", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await logIn(page, "demo.direction");
  await page.goto("/events");

  await page.getByRole("button", { name: /^Autres actions pour/ }).first().tap();
  await page.getByRole("menuitem", { name: /^Modifier/ }).tap();

  // The edit route, and nothing underneath the menu was activated on the way.
  await expect(page).toHaveURL(/\/events\/\d+\/edit$/);
  await ctx.close();
});
```

The `logIn` helper already exists at the top of that file.

- [ ] **Step 4: Run the whole check**

From PowerShell:

```bash
npm run check
```

Expected: exit 0. `npm run check` does not run Playwright; run `npx playwright test` separately.

- [ ] **Step 5: Capture the closing evidence**

Start the mocked stack and measure, at 390px as `demo.direction`:

- a screenshot of `/events` showing the five-action souper card,
- a screenshot of `/members`,
- the action row's height before and after: 148px → 44px on the souper, 96px → 44px on a rehearsal, card 388px → 284px,
- `document.scrollWidth === document.clientWidth` still holding.

- [ ] **Step 6: Commit and open the PR**

```bash
git add web/e2e/members.spec.ts
git commit -m "test(e2e): pin the action row to one line at 390px"
git push -u origin feat/row-actions-overflow-menu
```

Open the PR with `.github/PULL_REQUEST_TEMPLATE.md` filled in, `Closes #118`, and the evidence from Step 5 in the body — including the mutation tests from Task 2 Step 7, Task 3 Step 6 and Task 3 Step 11 **demonstrated red**, not merely described. Do not merge: a merge to `main` deploys TEST.

---

## Self-Review

**Spec coverage.** §1 → Task 1. §2 → Task 2. §3's `modal={false}` → Task 1 Step 3, its load-bearing rule → Task 3 Step 11. §4 → Task 2 Steps 1 and 5. §5's three screens → Tasks 3, 4, 5; its exclusion of `/registration-options` is honoured by no task touching that file. §6's existing-tests subsection → Task 3 Steps 5-7 and Task 4 Step 3; keyboard → Task 1 Step 1 and Task 2 Step 3; touch → Task 6 Step 3; German → Task 3 Step 8; the mutation → Task 3 Step 11; Playwright → Task 6. §7 → Task 6 Step 5. §8 is out of scope by definition.

**One spec defect found and resolved:** §5's rule 3 says "one action in total" but its registrations row has two and is described as two inline. Task 2 implements *fewer than two menu items → all inline*, which satisfies both statements. The spec should be amended to match before this merges.

**Type consistency.** `RowAction` is defined once in Task 2 and imported by Tasks 3, 4 and 5 with the same field names throughout: `key`, `label`, `ariaLabel`, `onSelect`, `to`, `disabled`, `destructive`. `RowActions` takes `actions` / `inlineKey` / `triggerLabel` at all four call sites.

**Placeholders.** None: every code step carries the code, every test step carries the test, and every mutation step names the exact edit to make and the exact test that must go red.
