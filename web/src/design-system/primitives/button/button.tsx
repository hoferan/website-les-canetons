import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "../../internal/cn";

/**
 * The button primitive (layer 2). Vendored from shadcn/ui and now owned by the
 * design system, which means it may import no app code (ADR 0046): text and
 * links come in as `children` and `asChild`.
 *
 * What differs from stock shadcn:
 *
 * 1. Three sizes, each one height, one padding and one text size (#397): sm and
 *    md are 44px tall (--spacing-touch in styles.css), lg is 48px. The base
 *    keeps `min-h-touch` as the floor for a caller that sets its own height.
 *    Call sites pick a size and pass no size classes of their own
 *    (tools/button-sizes.test.mjs).
 * 2. A button is never given the `disabled` attribute: disabling the focused
 *    control blurs it to <body>, so an in-flight submit throws focus away. It
 *    uses `aria-disabled` plus an early return in the handler. `loading` is the
 *    same thing with `aria-busy` and a spinner, and ignores clicks (#394).
 * 3. Every `dark:` utility is stripped. The site has a single look (ADR 0022),
 *    and since styles.css declares no `@custom-variant dark`, Tailwind 4's
 *    `dark:` is a prefers-color-scheme media query that fires on any phone set
 *    to dark. Do not spell one out, even in a comment: Tailwind scans this file
 *    as text, so a full example generates the class.
 * 4. Colours and radii are semantic tokens (`bg-action`, `rounded-button`,
 *    tokens/tokens.css), never hues. The focus indicator is the one
 *    `focus-ring` utility, which replaces shadcn's 50 % alpha ring (2.5:1,
 *    #391).
 * 5. Pressing a framed button moves it onto its shadow: it translates by the
 *    shadow offset minus 1px and the shadow shrinks to 1px, the colour
 *    unchanged. `quiet` has no frame, so its word drops 3px onto its line
 *    (`press-quiet` in styles.css). `transition-all` animates it and the
 *    reduced-motion block in styles.css zeroes it; do not add a duration here.
 * 6. Variants are named by role (primary, secondary, danger, quiet, accent),
 *    and sizes set no radius of their own. There is no variant for the black
 *    stage: the shadow's colour and offset and the ring's colour come from the
 *    surface the button sits in (`data-surface`, tokens/tokens.css).
 *
 * Which controls carry an icon is decided in docs/adr/0025-icons-on-controls.md
 * and amended by docs/adr/0040-one-button-system.md.
 */
const buttonVariants = cva(
  "focus-ring inline-flex min-h-touch shrink-0 items-center justify-center gap-2 cursor-pointer font-medium whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-feedback-error [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The framed variants (ADR 0029): an ink outline and a hard offset
        // shadow. The shadow and the press live in compoundVariants below,
        // shared by all four.
        primary:
          "rounded-button border-3 border-ink bg-action font-bold text-content-on-action hover:bg-action-hover",
        secondary:
          "rounded-button border-3 border-ink bg-white font-bold text-content hover:bg-ground",
        danger:
          "rounded-button border-3 border-ink bg-action-danger font-bold text-content-on-action hover:bg-action-danger-hover",
        accent:
          "rounded-button border-3 border-ink bg-action-accent font-bold text-content hover:bg-action-accent-hover",
        // Quiet stays flat: an icon inside a field, a link in a sentence.
        quiet: "relative rounded-control press-quiet",
      },
      // One height, one padding and one text size per size (#397). An icon
      // does not change the padding. No size sets a radius: tailwind-merge
      // lets the size's class win over the variant's, which would square off
      // the small raised buttons.
      size: {
        sm: "h-touch px-3 text-sm",
        md: "h-touch px-4 text-sm",
        lg: "h-12 px-5 text-base",
        icon: "size-touch text-sm",
        "icon-sm": "size-touch text-sm",
        "icon-lg": "size-12 text-sm",
      },
    },
    // A framed button presses onto its shadow: the offset minus 1px, and the
    // shadow shrinks to 1px. The offset is the surface's (3px on the page,
    // 4px on the stage), so the press reads it too.
    compoundVariants: [
      {
        variant: ["primary", "secondary", "danger", "accent"],
        class:
          "shadow-raised-sm active:translate-x-[calc(var(--raised-offset)-1px)] active:translate-y-[calc(var(--raised-offset)-1px)] active:shadow-raised-pressed",
      },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (a link, say) with the button's looks. */
    asChild?: boolean;
    /**
     * The button is working: it keeps focus, ignores clicks, announces itself
     * busy and shows a spinner beside its label. It stays as wide as it was
     * because the label stays; only the spinner is added.
     */
    loading?: boolean;
  };

function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  const busy = loading || undefined;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      aria-busy={busy}
      aria-disabled={busy ?? props["aria-disabled"]}
      // aria-disabled alone does not stop a click, so the handler is dropped.
      onClick={loading ? undefined : onClick}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
