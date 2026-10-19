import { cn } from "@/lib/utils";

/**
 * The page shell: the centred column, the gutter and the vertical rhythm.
 *
 * Pages use it instead of hand-writing widths, so the content lines up with
 * the header, nav and footer.
 *
 * Three widths, and no more:
 *   shell: the default, the same width as the chrome, so gutters line up
 *   text:  a prose column kept near 65 characters, centred
 *   form:  a single narrow form
 *
 * The `text` column is centred on purpose. It cannot share a left edge with
 * the wider chrome, and left-aligning it would leave a wide empty strip beside
 * it on a desktop. So the shared left edge holds for `shell` pages only.
 */
export function PageSection({
  children,
  width = "shell",
  className,
}: {
  children: React.ReactNode;
  width?: "shell" | "text" | "form";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mx-auto px-4 py-8",
        width === "shell" && "max-w-shell",
        width === "text" && "max-w-text",
        width === "form" && "max-w-md",
        className,
      )}
    >
      {children}
    </section>
  );
}
