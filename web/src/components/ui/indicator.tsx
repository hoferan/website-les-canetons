import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const indicatorVariants = cva(
  "pointer-events-none absolute z-10 flex items-center justify-center rounded-full leading-none font-semibold tabular-nums",
  {
    variants: {
      // The site's own colours. A light fill takes ink figures, a dark one white.
      color: {
        cyan: "bg-cyan text-ink",
        pink: "bg-pink text-ink",
        lime: "bg-lime text-ink",
        yellow: "bg-yellow text-ink",
        violet: "bg-violet text-white",
        danger: "bg-danger text-white",
        ink: "bg-ink text-white",
      },
      size: { sm: "", md: "", lg: "" },
      // A dot is round; a count is a pill as wide as its figures.
      shape: { dot: "", count: "" },
      ring: { ink: "ring-2 ring-ink", white: "ring-2 ring-white", none: "" },
      position: { "top-right": "", "top-left": "", "bottom-right": "", "bottom-left": "" },
      // `over` centres the mark on the corner, half outside the host; `inside`
      // keeps it within the host, 4px from both edges.
      placement: { over: "", inside: "" },
    },
    compoundVariants: [
      { shape: "dot", size: "sm", class: "size-2" },
      { shape: "dot", size: "md", class: "size-3" },
      { shape: "dot", size: "lg", class: "size-4" },
      { shape: "count", size: "sm", class: "h-4 min-w-4 px-1 text-[10px]" },
      { shape: "count", size: "md", class: "h-5 min-w-5 px-1.5 text-xs" },
      { shape: "count", size: "lg", class: "h-6 min-w-6 px-2 text-sm" },
      {
        placement: "over",
        position: "top-right",
        class: "top-0 right-0 translate-x-1/2 -translate-y-1/2",
      },
      {
        placement: "over",
        position: "top-left",
        class: "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
      },
      {
        placement: "over",
        position: "bottom-right",
        class: "right-0 bottom-0 translate-x-1/2 translate-y-1/2",
      },
      {
        placement: "over",
        position: "bottom-left",
        class: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
      },
      { placement: "inside", position: "top-right", class: "top-1 right-1" },
      { placement: "inside", position: "top-left", class: "top-1 left-1" },
      { placement: "inside", position: "bottom-right", class: "right-1 bottom-1" },
      { placement: "inside", position: "bottom-left", class: "bottom-1 left-1" },
    ],
    defaultVariants: {
      color: "cyan",
      size: "md",
      shape: "dot",
      ring: "ink",
      position: "top-right",
      placement: "over",
    },
  },
);

type IndicatorProps = Omit<VariantProps<typeof indicatorVariants>, "shape"> & {
  /** The element that wears the mark. */
  children: ReactNode;
  /** False leaves the host bare, in the same wrapper, so nothing moves. */
  show?: boolean;
  /** A number instead of a dot. Zero shows nothing. */
  count?: number;
  /** The highest count shown as is; above it reads "99+". */
  max?: number;
  /** Places the wrapper, which takes the host's place in the layout. */
  className?: string;
};

/**
 * Puts a dot, or a small count, on a corner of any element: a status the
 * element wears, such as a block the band has changed (#359).
 *
 * It wraps the host in a `relative` inline-flex span marked `data-indicator`
 * and draws the mark over it. A host that was placed itself (an absolute
 * corner chip) hands its placing classes to `className`, since the wrapper is
 * now the box its parent lays out.
 *
 * The mark is hidden from assistive technology. It never carries meaning on
 * its own, so the host must say it, in its accessible name or nearby text.
 */
export function Indicator({
  children,
  show = true,
  count,
  max = 99,
  className,
  color,
  size,
  ring,
  position,
  placement,
}: IndicatorProps) {
  const shown = show && count !== 0;
  const figure = count === undefined ? null : count > max ? `${max}+` : String(count);
  return (
    <span data-indicator="" className={cn("relative inline-flex", className)}>
      {children}
      {shown ? (
        <span
          aria-hidden="true"
          className={indicatorVariants({
            color,
            size,
            ring,
            position,
            placement,
            shape: figure === null ? "dot" : "count",
          })}
        >
          {figure}
        </span>
      ) : null}
    </span>
  );
}
