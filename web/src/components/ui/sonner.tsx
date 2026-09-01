import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * VENDORED from shadcn/ui and rewritten.
 *
 * The registry version imports useTheme from `next-themes` and declares it as a
 * dependency. That is a Next.js package, this is a Vite app, and Scène commits
 * to a single light look -- so the import is gone, next-themes is not
 * installed, and the theme is fixed.
 *
 * Its lucide icon set went with it too. lucide-react stays installed -- Layout
 * and EventActions already draw from it -- but a toast whose whole content is
 * one short French sentence does not need a glyph to be understood, and the
 * registry's five-icon map is five imports for nothing.
 *
 * Colours come through the shadcn token aliases in styles.css, which are
 * one-directional aliases of the Scène palette, so a toast matches the rest of
 * the app without naming a colour here.
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
