import * as React from "react";
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "../../internal/cn";

const surfaceVariants = cva(
  // One radius for every variant (#386). No display, gap or flex here: a
  // Surface draws a region and leaves its content's layout to the caller.
  "rounded-surface",
  {
    variants: {
      variant: {
        // A row of a list in the members' area. No shadow: most of these hold
        // raised buttons, and the shadow stays a sign of what can be pressed
        // (ADR 0029).
        list: "border-2 border-surface-edge bg-surface",
        // A tile that stands out on the public pages, such as the home tiles.
        feature: "border-3 border-surface-edge bg-surface shadow-raised",
        // The panel that holds a form. Its 3px shadow sits a step below a
        // feature tile's 5px, so the panel does not look like it can be pressed.
        form: "border-3 border-surface-edge bg-surface shadow-raised-sm",
        // Something that is not there yet, such as "Nouveau rôle". No fill,
        // so the page shows through; the muted ink edge measures 6.6:1 on cream.
        placeholder: "border-2 border-dashed border-surface-placeholder-edge",
      },
      padding: {
        md: "p-4",
        lg: "p-5",
      },
      // A tile on a coloured band leans one way or the other (ADR 0029).
      // Tailwind 4 writes `rotate` and `translate` as separate properties, so
      // an interactive surface still lifts on hover while it leans.
      tilt: {
        left: "-rotate-[1.2deg]",
        right: "rotate-1",
      },
    },
    defaultVariants: { variant: "list", padding: "md" },
  },
);

type SurfaceVariant = "list" | "feature" | "form" | "placeholder";

type SurfaceElement = "div" | "article" | "li" | "section" | "form";

type SurfaceOwnProps = {
  variant?: SurfaceVariant;
  padding?: "md" | "lg";
  tilt?: "left" | "right";
  /**
   * The whole surface is one link: it lifts on hover and wears the focus
   * ring. Pass the link as the only child with `asChild`, so the surface is
   * the link and its text is the link's accessible name. Nothing inside may be
   * interactive, since a link must not hold a button or another link.
   */
  interactive?: boolean;
};

type SurfaceProps<As extends SurfaceElement> = SurfaceOwnProps &
  Omit<React.ComponentPropsWithRef<As>, keyof SurfaceOwnProps> & {
    /** The element drawn, so an `<li>` or an `<article>` keeps its role. */
    as?: As;
    /** Draw the surface on the only child instead, such as a whole-card link. */
    asChild?: boolean;
  };

/**
 * The surface primitive (layer 2): a bounded region, the card every list row,
 * tile and form panel is drawn on (#386).
 *
 * - `list`: a row in a list, 2px edge, no shadow.
 * - `feature`: a public tile, 3px edge and the 5px hard shadow.
 * - `form`: the panel round a form, 3px edge and the 3px hard shadow.
 * - `placeholder`: what is about to be added, a dashed edge and no fill.
 *
 * `md` padding is 16px, `lg` 20px. Surface does not lay out its content and is
 * not a link by itself; see `interactive`.
 *
 * With `asChild`, Radix Slot joins the surface's classes to the child's by
 * plain concatenation, not tailwind-merge, so give the child no classes that
 * collide with these: pass them to Surface instead.
 */
function Surface<As extends SurfaceElement = "div">({
  as,
  asChild = false,
  variant = "list",
  padding = "md",
  tilt,
  interactive = false,
  className,
  ...props
}: SurfaceProps<As>) {
  const Comp: React.ElementType = asChild ? Slot.Root : (as ?? "div");
  return (
    <Comp
      data-slot="surface"
      data-variant={variant}
      className={cn(
        surfaceVariants({ variant, padding, tilt }),
        interactive && "focus-ring transition-transform hover:-translate-y-0.5",
        className,
      )}
      {...props}
    />
  );
}

export { Surface, surfaceVariants, type SurfaceVariant };
