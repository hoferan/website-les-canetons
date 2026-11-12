import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The design system's own class helper. It cannot import `@/lib/utils` (the
 * app) without breaking the dependency rule, so it carries its own copy.
 *
 * tailwind-merge knows only Tailwind's built-in scales. Every custom token that
 * a component's classes can collide on is listed here, or two classes of one
 * group would sit side by side instead of the later one winning: the raised
 * shadows from styles.css and the radius roles from tokens/tokens.css. A new
 * --shadow-* or --radius-* token belongs in this list too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["raised", "raised-sm", "raised-stage", "raised-pressed", "raised-stage-pressed"],
      radius: ["control", "button"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
