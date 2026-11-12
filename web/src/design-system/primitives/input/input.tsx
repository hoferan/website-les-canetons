import * as React from "react";

import { cn } from "../../internal/cn";

/**
 * The text input primitive (layer 2). Vendored from shadcn/ui, with
 * `min-h-touch` (the 44px floor) in place of its fixed `h-9`, every `dark:`
 * utility stripped for the reason button.tsx records, and the one `focus-ring`
 * utility in place of shadcn's translucent ring (#391).
 *
 * A form's text fields go through FormField, which owns the error wiring: set
 * `aria-invalid` and the border turns to the error colour.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-touch w-full min-w-0 rounded-control border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-ring",
        "aria-invalid:border-feedback-error",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
