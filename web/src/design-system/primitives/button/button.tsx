import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "../../internal/cn";

/**
 * The button primitive (layer 2). Vendored from shadcn/ui and now owned by the
 * design system, which means it may import no app code (ADR 0003): text and
 * links come in as `children` and `asChild`.
 *
 * What differs from stock shadcn:
 *
 * 1. `min-h-touch` (44px, --spacing-touch in styles.css) on the base, so every
 *    button has the touch floor. A consequence worth knowing: the `h-*` in the
 *    size variants are below 44px, so min-height wins and the sizes differ only
 *    in padding and text size (#397 tracks cleaning that up).
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
 *    `focus-ring` / `focus-ring-stage` utility, which replaces shadcn's 50 %
 *    alpha ring (2.5:1, #391).
 * 5. Pressing a framed button moves it onto its shadow: it translates by the
 *    shadow offset minus 1px and the shadow shrinks to 1px, the colour
 *    unchanged. `quiet` has no frame, so its word drops 3px onto its line
 *    (`press-quiet` in styles.css). `transition-all` animates it and the
 *    reduced-motion block in styles.css zeroes it; do not add a duration here.
 * 6. Variants are named by role (primary, secondary, danger, quiet, accent), a
 *    `surface` for the black stage, and sizes that set no radius of their own.
 *
 * Which controls carry an icon is decided in docs/adr/0025-icons-on-controls.md
 * and amended by docs/adr/0040-one-button-system.md.
 */
const buttonVariants = cva(
  "inline-flex min-h-touch shrink-0 items-center justify-center gap-2 cursor-pointer text-sm font-medium whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-feedback-error aria-invalid:ring-feedback-error/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The framed variants (ADR 0029): an ink outline and a hard offset
        // shadow. The shadow and the press live in compoundVariants below,
        // because they depend on the surface.
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
      // The page is cream, the stage is black. Ink on black vanishes, so on the
      // stage the shadow and the focus ring turn pink and white.
      surface: {
        page: "focus-ring",
        stage: "focus-ring-stage",
      },
      // No size sets a radius: tailwind-merge lets the size's class win over
      // the variant's, which would square off the small raised buttons.
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
  size = "default",
  surface = "page",
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
      data-surface={surface}
      className={cn(buttonVariants({ variant, size, surface, className }))}
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
