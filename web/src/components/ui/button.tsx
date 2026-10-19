import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Vendored from shadcn/ui, with five local changes:
 *
 * 1. `min-h-touch` (44px, --spacing-touch in styles.css) on the base, so every
 *    button has the touch floor.
 * 2. This app never sets the `disabled` attribute on a button: disabling the
 *    focused control blurs it to <body>, so an in-flight submit throws focus
 *    away. It uses aria-disabled plus an early return in the handler, styled
 *    by the `aria-disabled:` variants. The `disabled:` ones stay only because
 *    vendored markup may still pass the attribute.
 * 3. Every `dark:` utility is stripped, here and in anything vendored. The
 *    site has a single look (ADR 0022), and since styles.css declares no
 *    `@custom-variant dark`, Tailwind 4's `dark:` is a prefers-color-scheme
 *    media query that fires on any phone set to dark.
 *
 *    Do not spell one out, even in a comment: Tailwind scans this file as
 *    text, so a full example generates the class.
 * 4. `active:scale-[0.98]` on the base, the press feedback. `transition-all`
 *    animates it and the reduced-motion block in styles.css zeroes it; do not
 *    add a duration here.
 * 5. The `raised` variants in place of shadcn's own, and sizes that set no
 *    radius of their own.
 *
 * Which controls carry an icon, and which carry only one, is decided in
 * docs/adr/0025-icons-on-controls.md.
 */
const buttonVariants = cva(
  "inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none active:scale-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // 5. The raised variants (ADR 0029): an ink outline and a hard offset
        // shadow on every page. They replace shadcn's default, outline,
        // secondary and destructive. On the stage the caller swaps the shadow
        // for shadow-raised-stage, since ink on black vanishes.
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
        // The icon sizes carry `min-w-touch` because the base sets only a
        // minimum height. A text button gets its width from padding; an
        // icon-only one would render as a 32px-wide sliver.
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
