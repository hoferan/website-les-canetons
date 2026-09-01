import { cn } from "@/lib/utils";

/**
 * The page shell: the centred column, the gutter and the vertical rhythm.
 *
 * WHY IT EXISTS. Pages hand-wrote `mx-auto max-w-… px-4 py-8` about
 * thirty-five times, between them using FIVE different widths -- max-w-3xl,
 * 5xl, md, 4xl and 2xl -- while the header, nav and footer were fixed at
 * max-w-5xl. So at 1280 the nav's first item started at x=143 and the page
 * content at x=272: a misalignment visible on every page of the site.
 *
 * Three widths, and no more:
 *   shell — the default, and the same width as the chrome, so gutters line up
 *   text  — a prose column, kept near 65 characters
 *   form  — a single narrow form, as /authentification_inscription wants
 *
 * `section` rather than `div`: every page's outermost element already was one.
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
