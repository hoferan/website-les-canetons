import * as React from "react";

import { cn } from "../../internal/cn";

/**
 * The checkbox primitive (layer 2): a native `<input type="checkbox">` with a
 * box that keeps its size.
 *
 * A flex row lets an input shrink: beside a label that wraps, a box without
 * `shrink-0` measured 13 px wide on /roles (#390). `shrink-0` and a fixed
 * `size-5` keep it at 20x20 px in any row.
 *
 * The vertical margin centres the box on the first line of a label beside it.
 * An input inherits the row's line height, so `1lh` is that line's height; the
 * app's 24 px line leaves 2 px above and below. In an `items-start` row that
 * puts the box on the first line of a label that wraps. In an `items-center`
 * row the two margins are equal, so the centre stays where it was. Measured
 * on every form that has a checkbox, at 375, 768 and 1280 px, the box's
 * centre is within 0.5 px of the first line's.
 *
 * It stays a native input, so the label's `htmlFor` and a form library's
 * `register` work with it unchanged. The caller supplies the label and keeps
 * the row at least `min-h-touch` tall.
 */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      // The one raw checkbox the app may have; eslint.config.js refuses others.
      // eslint-disable-next-line no-restricted-syntax
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "my-[calc((1lh-1.25rem)/2)] size-5 shrink-0 cursor-pointer accent-primary",
        "focus-ring",
        // The browser greys a disabled box itself, so it gets no extra opacity.
        "disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
