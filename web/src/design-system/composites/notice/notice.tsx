import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../internal/cn";
import { LEVELS, LevelDisc, type Level } from "../../internal/levels";
import { IconButton } from "../../primitives";

export type NoticeLevel = Level;

export type NoticeProps = {
  /** Info unless said otherwise (ADR 0042). */
  level?: NoticeLevel;
  children: ReactNode;
  className?: string;
  /**
   * Shows a ✕, only where the screen lets the notice be dismissed. The label
   * is the ✕'s accessible name, in the page's language.
   */
  dismiss?: { label: string; onDismiss: () => void };
};

/**
 * A note to the reader, in the flow of the page, at one of the toast's four
 * levels (ADR 0042): the same icon on the same disc, in front of the same
 * column colour, so a level means the same thing in both places.
 *
 * It informs and never gates: what it explains stays fully usable underneath.
 * Something that hides a control is a dialog, a guard or an empty state.
 *
 * Flat, in a light frame: no shadow and no clock, because it sits in the page
 * and not above it. An ink frame made it read as one more card next to the
 * members' list cards; André picked the light one from mocks on #376.
 *
 * No `role="alert"` or `role="status"`: live regions announce a change, and
 * most notices are on the page before the reader arrives, so a live region
 * would interrupt a screen-reader user with a paragraph they were about to
 * reach. A notice that answers an action goes inside a live region its caller
 * renders beforehand, since a region that mounts with its text in it is not
 * announced.
 */
export function Notice({ level = "info", children, className, dismiss }: NoticeProps) {
  return (
    <div
      data-notice-level={level}
      className={cn(
        "grid grid-cols-[3rem_1fr_auto] overflow-hidden rounded-surface border border-line bg-panel text-ink",
        className,
      )}
    >
      <span data-notice-column="" className={cn("grid place-items-center", LEVELS[level].fill)}>
        <LevelDisc level={level} size="sm" />
      </span>
      <div className="min-w-0 self-center p-3">{children}</div>
      {dismiss ? (
        <div className="self-center pr-1">
          <IconButton
            type="button"
            variant="quiet"
            icon={X}
            label={dismiss.label}
            onClick={dismiss.onDismiss}
          />
        </div>
      ) : null}
    </div>
  );
}
