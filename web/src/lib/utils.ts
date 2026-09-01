import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
