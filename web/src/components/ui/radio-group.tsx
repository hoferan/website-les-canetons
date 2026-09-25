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
 * is held. jsdom cannot show this, so web/e2e/members.spec.ts measures it.
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
