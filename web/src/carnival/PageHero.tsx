import type { Ref } from "react";

import { cn } from "@/lib/utils";

import { Confetti } from "./Confetti";
import { Highlighted } from "./Highlighted";
import { Scallop } from "./Scallop";

/** Bright on the violet-to-pink poster; white reads there, ink would not. */
export const POSTER_CONFETTI = [
  "var(--color-yellow)",
  "var(--color-cyan)",
  "var(--color-lime)",
  "#fff",
];

/**
 * The short poster hero that opens a public page (ADR 0029): the page's h1,
 * an optional line under it, confetti, and the scalloped edge into the cream.
 *
 * The home page has its own, taller hero with the badge and two buttons. This
 * one carries a heading and a sentence and nothing a visitor has to press.
 *
 * `width` matches the PageSection below it, so the heading starts on the same
 * left edge as the page it opens.
 *
 * White text runs from the bottom left, where the poster is violet. Text that
 * reaches further right or higher needs its contrast measured again; the ADR
 * gives the reason.
 */
export function PageHero({
  title,
  mark = "",
  seed,
  width = "shell",
  headingRef,
  children,
}: {
  title: string;
  /** The words of `title` to set on the yellow highlight, if any. */
  mark?: string;
  seed: number;
  width?: "shell" | "text" | "form";
  /**
   * For a page that swaps its content in place and has to move focus to the
   * new heading, as a form's success state does. Passing it also makes the h1
   * focusable from script, never by Tab.
   */
  headingRef?: Ref<HTMLHeadingElement>;
  /** A line or two under the heading, already translated. */
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden bg-poster text-white">
      <Confetti seed={seed} colours={POSTER_CONFETTI} />
      {/* `pb-14` and up leave the Scallop its 22px over the bottom edge. */}
      <div
        className={cn(
          "relative mx-auto px-4 pt-8 pb-14 md:pt-12 md:pb-20",
          width === "shell" && "max-w-shell",
          width === "text" && "max-w-text",
          width === "form" && "max-w-md",
        )}
      >
        {/* leading-[1.18] as on the home page, so a highlight that wraps gets a
            bar per line: see Highlighted.tsx. */}
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          data-confetti-avoid
          className="w-fit font-display text-3xl leading-[1.18] outline-none sm:text-4xl md:text-5xl"
        >
          <Highlighted text={title} mark={mark} />
        </h1>
        {children ? (
          <div data-confetti-avoid className="mt-related w-fit max-w-text text-lg">
            {children}
          </div>
        ) : null}
      </div>
      <Scallop into="var(--color-ground)" />
    </div>
  );
}
