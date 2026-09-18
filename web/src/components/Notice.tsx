import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A note to the reader, in the flow of the page.
 *
 * IT INFORMS AND NEVER GATES, which is the whole reason it exists as its own
 * component rather than as a paragraph somebody styles again each time. The
 * screens that want one are saying "here is something you may not know" — the
 * committee-issued password on /account, the direct line to the committee on
 * /contact — and in both the thing being explained stays fully usable
 * underneath. A notice that hides a control is the wrong component; that is a
 * dialog, a guard or an empty state.
 *
 * NOT `role="alert"`, AND NOT `role="status"`. Both are live regions, which
 * exist to announce something that CHANGED. These notices are on the page
 * before the reader arrives, so a live region would interrupt a screen-reader
 * user to read out a paragraph they were about to reach anyway — and would
 * spend the error vocabulary's semantics on something that is not an error.
 * `FormError` is the component for that, and it keeps `role="alert"` because
 * its content genuinely appears in response to an action.
 *
 * The violet edge, rather than the plain `border-line bg-panel` panel used for
 * forms and cards: those read as "here is a thing to fill in or act on", and a
 * notice is neither. `bg-accent` is `--color-violet` at 10% against white, so
 * `text-ink` on it stays far the right side of contrast.
 */
export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-l-4 border-line border-l-violet bg-accent p-3 text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}
