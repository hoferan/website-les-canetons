import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Vendored from shadcn/ui and rewritten.
 *
 * The registry version imports useTheme from `next-themes`, a Next.js package.
 * This app has a single light look (ADR 0022), so next-themes is not installed
 * and the theme is fixed. The registry's icon map is dropped too: a toast of
 * one short sentence needs no glyph.
 *
 * Colours come through the shadcn token aliases in styles.css, so a toast
 * matches the rest of the app without naming a colour here.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-panel group-[.toaster]:text-ink group-[.toaster]:border-line group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-ink-muted",
          actionButton: "group-[.toast]:bg-violet group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-ground group-[.toast]:text-ink-muted",
        },
      }}
      {...props}
    />
  );
}
