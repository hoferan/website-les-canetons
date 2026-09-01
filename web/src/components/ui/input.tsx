import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * VENDORED from shadcn/ui, plus `min-h-touch` — the same 44px floor as Button,
 * replacing its `h-9` so the floor is not fought by a fixed height — and with
 * every `dark:` utility stripped, for the reason button.tsx records.
 *
 * NOT wired up directly by pages. web/src/components/FormField.tsx is the only
 * entry point for a text field in this app, because it owns the aria-invalid /
 * aria-describedby / error-id wiring that is trivially correct and just as
 * trivially copy-pasted wrong. FormField renders this.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-touch w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
