import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * A segmented control: pick one of a few views, all of them visible at once.
 *
 * Vendored from radix-ui like ui/dropdown-menu.tsx and ui/alert-dialog.tsx,
 * with the same `data-slot` attributes and `cn()` composition. Root and Item
 * only: a segment shows its state by filling, so there is no `Indicator`.
 * No `dark:` utility, for the reason in ui/button.tsx.
 *
 * RadioGroup rather than ToggleGroup. `ToggleGroup type="single"` renders
 * radio roles but never selects on an arrow key, so focus moves while
 * `aria-checked` stays false. RadioGroup selects the item an arrow lands on.
 * jsdom cannot show this, so web/e2e/members.spec.ts measures it.
 *
 * A radio group also cannot be cleared, where a ToggleGroup calls
 * `onValueChange("")` when the pressed item is pressed again, so call sites
 * need no guard (see the test).
 *
 * The root needs an accessible name from its caller, or it announces radios
 * belonging to nothing.
 */
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn(
        // `w-fit`: as wide as its options, not the row.
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
        // min-h-touch: the 44px floor every control carries.
        // RadioGroup's data-state is checked/unchecked, not on/off.
        "inline-flex min-h-touch shrink-0 cursor-default items-center justify-center rounded-sm px-4 text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { RadioGroup, ToggleOption };
