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
 * 4. Pressing a framed button moves it onto its shadow: it translates by the
 *    shadow offset minus 1px and the shadow shrinks to 1px, the colour
 *    unchanged. `quiet` has no frame, so it sinks 1px and takes a darker
 *    patch. `transition-all` animates it and the reduced-motion block in
 *    styles.css zeroes it; do not add a duration here.
 * 5. Variants named by role (primary, secondary, danger, quiet, accent) in
 *    place of shadcn's own, a `surface` for the black stage, and sizes that
 *    set no radius of their own.
 *
 * Which controls carry an icon, and which carry only one, is decided in
 * docs/adr/0025-icons-on-controls.md.
 */
const buttonVariants = cva(
  "inline-flex min-h-touch shrink-0 items-center justify-center gap-2 cursor-pointer rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // 5. The framed variants (ADR 0029): an ink outline and a hard offset
        // shadow. The shadow and the press live in compoundVariants below,
        // because they depend on the surface.
        primary:
          "rounded-xl border-3 border-ink bg-violet font-bold text-white hover:bg-violet-hover",
        secondary: "rounded-xl border-3 border-ink bg-white font-bold text-ink hover:bg-ground",
        danger:
          "rounded-xl border-3 border-ink bg-danger font-bold text-white hover:bg-danger-hover",
        accent: "rounded-xl border-3 border-ink bg-yellow font-bold text-ink hover:bg-yellow-hover",
        // Quiet stays flat: an icon inside a field, a link in a sentence.
        quiet:
          "hover:bg-accent hover:text-accent-foreground active:translate-y-px active:bg-violet/20",
      },
      // The page is cream, the stage is black. Ink on black vanishes, so on the
      // stage the shadow and the focus ring turn pink.
      surface: {
        page: "",
        stage: "focus-ring-stage",
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
    // A framed button presses onto its shadow: the offset minus 1px, and the
    // shadow shrinks to 1px.
    compoundVariants: [
      {
        variant: ["primary", "secondary", "danger", "accent"],
        surface: "page",
        class:
          "shadow-raised-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-raised-pressed",
      },
      {
        variant: ["primary", "secondary", "danger", "accent"],
        surface: "stage",
        class:
          "shadow-raised-stage active:translate-x-[3px] active:translate-y-[3px] active:shadow-raised-stage-pressed",
      },
    ],
    defaultVariants: {
      variant: "primary",
      size: "default",
      surface: "page",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "default",
  surface = "page",
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
      data-surface={surface}
      className={cn(buttonVariants({ variant, size, surface, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
