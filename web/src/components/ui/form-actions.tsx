import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The one footer for every form and dialog. Save comes first and sits on the
 * left; on a phone the buttons stack full width with Save on top. A quiet
 * action (a reset, say) goes to the far end from `sm`.
 *
 * The caller owns the order: confirm first, then Cancel, then the quiet one.
 * The DOM order is also the tab and reading order, so it is not flipped with
 * CSS.
 */
function FormActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        "flex flex-col items-stretch gap-related sm:flex-row sm:flex-wrap sm:items-center sm:[&>[data-variant=quiet]]:ml-auto",
        className,
      )}
      {...props}
    />
  );
}

export { FormActions };
