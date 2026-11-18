import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../internal/cn";

/**
 * The tag tints, by the name the API gives a tag's colour. The app's
 * `TagColour` must stay assignable to this; TagChip passes one straight in.
 */
type BadgeTint = "violet" | "teal" | "amber" | "pink" | "blue" | "green" | "coral" | "gray";

/**
 * Written out whole: Tailwind generates only the classes it finds as literals,
 * so `bg-tag-${tint}` would compile to nothing. Each ink is at least 8:1 on
 * its tint (styles.css).
 */
const TINTS: Record<BadgeTint, string> = {
  violet: "bg-tag-violet text-tag-violet-ink",
  teal: "bg-tag-teal text-tag-teal-ink",
  amber: "bg-tag-amber text-tag-amber-ink",
  pink: "bg-tag-pink text-tag-pink-ink",
  blue: "bg-tag-blue text-tag-blue-ink",
  green: "bg-tag-green text-tag-green-ink",
  coral: "bg-tag-coral text-tag-coral-ink",
  gray: "bg-tag-gray text-tag-gray-ink",
};

const badgeVariants = cva(
  // Every tone keeps a 1px border, transparent on a tag, so a size has one
  // height whatever its tone: 22px for sm, 26px for md. `whitespace-nowrap`
  // because a status pill broken over two lines reads as two pills.
  "inline-flex max-w-full items-center gap-1 rounded-pill border px-2 py-0.5 whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-status-neutral-edge bg-status-neutral text-content",
        tag: "border-transparent",
        attention: "border-status-edge bg-status-attention text-content",
        success: "border-status-edge bg-status-success text-content",
        danger: "border-status-danger bg-status-danger text-content-on-status-danger",
      },
      // One type spec per size, so "Public" and "Brouillon" can no longer
      // differ in weight (#385).
      size: {
        sm: "text-xs font-semibold",
        md: "text-sm font-medium",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

type BadgeTone = "neutral" | "tag" | "attention" | "success" | "danger";

type BadgeProps = Omit<React.ComponentProps<"span">, "children"> & {
  children: React.ReactNode;
  size?: "sm" | "md";
  /** Decorative: the word carries the meaning, so the icon is hidden from assistive technology. */
  icon?: React.ReactNode;
} & ({ tone: "tag"; tint: BadgeTint } | { tone?: Exclude<BadgeTone, "tag">; tint?: never });

/**
 * The badge primitive (layer 2): a short status or category on a thing, such
 * as an event's tag, a draft, or an account nobody has used yet (#385).
 *
 * Display only. It has no hover, focus or role: a filter or a toggle is a
 * button, and a count over an avatar is an Indicator. The text is always
 * there, so no tone means anything by colour alone (WCAG 1.4.1).
 *
 * - `neutral`: a plain fact, such as "Public", "Brouillon" or "Membre".
 * - `tag`: an event tag, in its `tint`.
 * - `attention`: something somebody should look at or act on.
 * - `success`: done, such as "Payé".
 * - `danger`: a fault, such as a booking flagged as spam.
 *
 * `sm` sits inside dense cards (12px/600), `md` beside body text (14px/500).
 * The caller keeps a badge out of an inline run of text: as a flex child it
 * takes its own height, while inline it would sit on the text's baseline.
 */
function Badge({
  tone = "neutral",
  size = "md",
  tint,
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className={cn(
        badgeVariants({ tone, size }),
        tone === "tag" && tint ? TINTS[tint] : null,
        className,
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

export { Badge, type BadgeTint, type BadgeTone };
