import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge knows Tailwind's own shadow sizes and nothing of this theme's.
 * The raised shadows in styles.css are listed here so that one of them REPLACES
 * a vendored component's shadow-sm instead of landing beside it, where
 * whichever rule Tailwind emitted last would win. A new --shadow-* token in
 * styles.css belongs in this list too.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ["raised", "raised-sm", "raised-stage"] } },
});

/**
 * shadcn/ui's class helper, as its CLI writes it.
 *
 * twMerge over clsx is the part that matters to callers: a later Tailwind class
 * REPLACES an earlier one in the same group rather than both landing in the
 * class list, which is what lets a caller pass `p-5` to a vendored component
 * whose base variant says `py-6` and actually win.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
