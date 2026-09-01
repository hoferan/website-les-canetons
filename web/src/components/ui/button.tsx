import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * VENDORED from shadcn/ui and then edited. Three deliberate local changes:
 *
 * 1. `min-h-touch` (44px, from --spacing-touch in styles.css) on the base
 *    variant. Every interactive control in this app has a floor, and putting it
 *    here is what stops it being a convention that survives until the next page
 *    is written.
 * 2. This app NEVER uses the `disabled` attribute on a button -- disabling the
 *    focused control blurs it to <body>, so an in-flight submit silently throws
 *    focus away. It uses aria-disabled plus an early return in the handler. The
 *    `aria-disabled:` variants below style that, and the `disabled:` ones are
 *    kept only because vendored markup may still pass the attribute.
 * 3. EVERY `dark:` UTILITY IS STRIPPED, and must stay stripped in anything
 *    vendored here. Scene commits to a single look, and Tailwind 4's default
 *    `dark:` variant is `@media (prefers-color-scheme: dark)` -- NOT a class --
 *    because styles.css does not declare `@custom-variant dark`. So a vendored
 *    a vendored dark-prefixed utility is not inert waiting for a class nobody
 *    adds: it fires on any phone whose OS is set to dark, which at a rehearsal
 *    at night is most of them. Verified in the built CSS, not assumed.
 *
 *    DO NOT SPELL ONE OUT EVEN IN A COMMENT. Tailwind scans this file as plain
 *    text, so an example written in full is itself a class it will generate --
 *    which is how the first draft of this very comment put a dark-mode rule
 *    back into the bundle it was warning about.
 */
const buttonVariants = cva(
  "inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
