import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge knows only Tailwind's own shadow and radius names. The
 * shadows and the radius roles in design-system/tokens/tokens.css are listed
 * so a caller's `shadow-raised` or `rounded-surface` replaces a component's
 * own instead of landing beside it. A new --shadow-* or --radius-* token
 * belongs in this list too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["raised", "raised-sm", "raised-pressed", "overlay"],
      radius: ["control", "button", "pill", "surface"],
    },
  },
});

/**
 * shadcn/ui's class helper, as its CLI writes it.
 *
 * twMerge makes a later class replace an earlier one in the same group, so a
 * caller's `p-5` wins over a vendored component's `py-6`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
