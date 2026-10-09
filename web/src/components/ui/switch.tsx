import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * An on/off setting that takes effect the moment it is flipped.
 *
 * VENDORED from radix-ui like ui/radio-group.tsx, with the same `data-slot`
 * attributes and `cn()` composition.
 *
 * ONLY FOR A WRITE THAT HAPPENS ON THE FLIP. A setting saved later by a form's
 * "Enregistrer" stays a checkbox: a switch promises the change has already
 * happened, and in a form it has not.
 *
 * THE TRACK IS 44x24 AND THE TARGET IS NOT. The caller puts the switch in a
 * row at least `min-h-touch` high, with its visible label beside it, so the
 * 44px floor ui/button.tsx keeps is met by the row. Off is the muted ink
 * rather than the line colour, because the track's edge is the only thing
 * that shows a switch is there, and `line` is too faint on cream for that.
 *
 * THE CALLER NAMES IT, and the name contains the visible label (WCAG 2.5.3),
 * so voice control can reach it by the word on screen.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-violet data-[state=unchecked]:bg-ink-muted",
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
