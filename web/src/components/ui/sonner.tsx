import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Vendored from shadcn/ui and rewritten.
 *
 * The registry version imports useTheme from `next-themes`, a Next.js package.
 * This app has a single light look (ADR 0022), so next-themes is not installed
 * and the theme is fixed.
 *
 * Every toast is a `ToastCard` raised through `notify` (./toast.tsx), which
 * sonner renders unstyled, so no toast class names are set here. Sonner keeps
 * the stack, the swipe, the live region and the position. The width is the
 * card's, 380px from ADR 0042's mock-up; below 600px sonner spans the screen.
 */
export function Toaster({ style, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={{ "--width": "380px", ...style } as CSSProperties}
      {...props}
    />
  );
}
