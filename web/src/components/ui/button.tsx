import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * VENDORED from shadcn/ui and then edited. Five deliberate local changes:
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
 * 4. `active:scale-[0.98]` on the base variant -- the press feedback. The
 *    existing `transition-all` animates it and the global reduced-motion
 *    block in styles.css zeroes it; do not add a duration here.
 * 5. The `raised` variants in place of shadcn's own, marked where they are
 *    defined, and sizes that set no radius of their own.
 *
 * Which controls carry an icon, and which carry only one, is decided in
 * docs/adr/0025-icons-on-controls.md. Read it before adding either.
 */
const buttonVariants = cva(
  "inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none active:scale-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // 5. THE RAISED VARIANTS ARE LOCAL, from ADR 0029: an ink outline and a
        // hard offset shadow, on every page, the members' area included. They
        // take the place of shadcn's default, outline, secondary and
        // destructive. On the stage the caller swaps the shadow for
        // shadow-raised-stage, since ink on black vanishes.
        raised:
          "rounded-xl border-3 border-ink bg-yellow font-bold text-ink shadow-raised-sm hover:bg-yellow/85",
        "raised-light":
          "rounded-xl border-3 border-ink bg-white font-bold text-ink shadow-raised-sm hover:bg-ground",
        "raised-violet":
          "rounded-xl border-3 border-ink bg-violet font-bold text-white shadow-raised-sm hover:bg-violet/90",
        "raised-danger":
          "rounded-xl border-3 border-ink bg-danger font-bold text-white shadow-raised-sm hover:bg-danger/90",
        // Ghost and link stay flat: an icon inside a field, a link in a sentence.
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // No size sets a radius. tailwind-merge lets the size's class win over
      // the variant's, so a radius here would square off the small raised
      // buttons.
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        // THE ICON SIZES CARRY `min-w-touch` BECAUSE THE BASE ONLY SETS A
        // MINIMUM HEIGHT. A text button reaches a usable width through its
        // padding; an icon-only one does not, so `size-8` here would render
        // 32px wide and 44px tall — a sliver, on the 390px phones this band
        // actually uses. The `size-*` still sets the resting square; the
        // minimum is what a thumb gets.
        icon: "size-9 min-w-touch",
        "icon-xs": "size-6 min-w-touch [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 min-w-touch",
        "icon-lg": "size-10 min-w-touch",
      },
    },
    defaultVariants: {
      variant: "raised-violet",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "raised-violet",
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
