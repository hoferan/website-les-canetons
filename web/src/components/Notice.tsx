import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A note to the reader, in the flow of the page.
 *
 * It informs and never gates: what it explains stays fully usable underneath.
 * Something that hides a control is a dialog, a guard or an empty state.
 *
 * No `role="alert"` or `role="status"`: live regions announce a change, and
 * these notices are on the page before the reader arrives, so a live region
 * would interrupt a screen-reader user with a paragraph they were about to
 * reach. `FormError` keeps `role="alert"` because its content appears in
 * response to an action.
 *
 * A violet edge rather than the `border-line bg-panel` panel of forms and
 * cards, which reads as something to fill in or act on. `bg-accent` is
 * `--color-violet` at 10% on white, so `text-ink` keeps its contrast.
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
