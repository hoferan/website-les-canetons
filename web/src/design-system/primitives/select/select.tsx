import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "../../internal/cn";

/**
 * The select primitive (layer 2): a native `<select>` dressed as Input, with
 * a chevron in place of the browser's arrow.
 *
 * It stays native on purpose (#405). A form library's `register` works with
 * it unchanged, a phone opens its own picker, and nothing in the app needs
 * search or rich options, which is all a scripted listbox would add.
 *
 * The border, radius, height, padding, text size and focus ring are Input's,
 * so a select and a text field side by side look like one family. A form's
 * select goes through FormField, which owns the error wiring: set
 * `aria-invalid` and the border turns to the error colour.
 *
 * `className` reaches the `<select>`, as it reaches Input's `<input>`. The
 * wrapper is there only to place the chevron; it is a flex box so the select
 * fills it, and the chevron stays centred, when a flex row stretches it.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="select-wrapper" className="relative flex">
      {/* The one raw select the app may have; eslint.config.js refuses others. */}
      {/* eslint-disable-next-line no-restricted-syntax */}
      <select
        data-slot="select"
        className={cn(
          "peer min-h-touch w-full min-w-0 cursor-pointer appearance-none rounded-control border border-input bg-transparent py-1 pr-9 pl-3 text-base transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-ring",
          "aria-invalid:border-feedback-error",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
      />
    </div>
  );
}

export { Select };
