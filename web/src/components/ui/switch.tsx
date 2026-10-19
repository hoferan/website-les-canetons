import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * An on/off setting that takes effect the moment it is flipped.
 *
 * Vendored from radix-ui like ui/radio-group.tsx, with the same `data-slot`
 * attributes and `cn()` composition.
 *
 * Only for a write that happens on the flip. A setting saved later by a form's
 * "Enregistrer" stays a checkbox: a switch promises the change has already
 * happened.
 *
 * The track is 44x24, so the caller puts the switch in a row at least
 * `min-h-touch` high with its visible label beside it, and the row meets the
 * 44px floor. Off is the muted ink because the track's edge is the only sign
 * a switch is there, and `line` is too faint on cream.
 *
 * The caller names it, and the name contains the visible label (WCAG 2.5.3).
 *
 * Busy is `aria-disabled`, never `disabled`, which would blur the focused
 * control to <body> (rule 2 in ui/button.tsx). The caller passes
 * `aria-disabled` and returns early from `onCheckedChange`.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[state=checked]:bg-violet data-[state=unchecked]:bg-ink-muted",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
