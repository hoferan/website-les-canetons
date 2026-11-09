import type { ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

import { Confetti } from "./Confetti";
import { Highlighted } from "./Highlighted";
import { SCALLOP_CLIP, Scallop } from "./Scallop";

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
 * The home page has its own, taller hero with the badge. This one carries a
 * heading and a sentence, and the buttons the band has put under them, if any
 * (`HeroBlock`).
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
  edit,
  children,
}: {
  title: string;
  /**
   * The words of `title` to set on the yellow highlight, if any. A title that
   * no longer contains them renders plain.
   */
  mark?: string;
  seed: number;
  width?: "shell" | "text" | "form";
  /**
   * For a page that swaps its content in place and has to move focus to the
   * new heading, as a form's success state does. Passing it also makes the h1
   * focusable from script, never by Tab.
   */
  headingRef?: Ref<HTMLHeadingElement>;
  /** The edit chip, in edit mode; the hero adds room above the heading for it. */
  edit?: ReactNode;
  /** A line or two under the heading, already translated. */
  children?: ReactNode;
}) {
  return (
    // data-edit-block: what stays clear of the fade while its editor is open.
    <div data-edit-block className={cn("relative bg-poster text-white", SCALLOP_CLIP)}>
      <Confetti seed={seed} colours={POSTER_CONFETTI} wobble />
      {/* The chip sits in the header's own corner, not the text column's. */}
      {edit}
      {/* `pb-14` and up leave the Scallop its 22px over the bottom edge. */}
      <div
        className={cn(
          "relative mx-auto px-4 pt-8 pb-14 md:pt-12 md:pb-20",
          edit && "pt-14 md:pt-14",
          width === "shell" && "max-w-shell",
          width === "text" && "max-w-text",
          width === "form" && "max-w-md",
        )}
      >
        <div className="relative">
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
      </div>
      <Scallop into="var(--color-ground)" />
    </div>
  );
}
