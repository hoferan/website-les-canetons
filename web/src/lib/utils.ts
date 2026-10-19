import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge knows only Tailwind's own shadow sizes. The raised shadows in
 * styles.css are listed so one of them replaces a vendored component's
 * shadow-sm instead of landing beside it. A new --shadow-* token in styles.css
 * belongs in this list too.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ["raised", "raised-sm", "raised-stage"] } },
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
