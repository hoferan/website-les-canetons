import * as React from "react";

import { cn } from "../../internal/cn";

/**
 * The multi-line text primitive (layer 2): a native `<textarea>` with Input's
 * border, radius, ground, focus ring and invalid state (#406).
 *
 * Three things differ from Input on purpose, because a textarea holds a
 * paragraph:
 *
 * - `py-2`, where Input has `py-1`: the first line sits clear of the border.
 * - `text-base` at every width, where Input drops to 14 px from `md`. The
 *   height follows the line height, and 16 px keeps the contact form's six
 *   rows at 162 px.
 * - No `shadow-xs`. No textarea in the app has worn one, and #406 asked for
 *   the contact form's message box to stay pixel-identical.
 *
 * There is no `min-h-touch`: the native two rows are 66 px, over the 44 px
 * floor, and a growing field sets its own minimum height through `className`.
 *
 * A form's textareas go through FormField, which owns the error wiring: set
 * `aria-invalid` and the border turns to the error colour.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    // The one raw textarea the app may have; eslint.config.js refuses others.
    // eslint-disable-next-line no-restricted-syntax
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-control border border-input bg-transparent px-3 py-2 text-base text-content transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-ring",
        "aria-invalid:border-feedback-error",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
