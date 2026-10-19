import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

/**
 * A link that looks like a button.
 *
 * Button carries the variants and the 44px floor, and `asChild` (Radix Slot)
 * puts them onto the link, so this is the whole component.
 *
 * `external` exists so an outbound link cannot be added without
 * rel="noreferrer": target="_blank" without it hands the destination a
 * window.opener it can navigate.
 *
 * The `external` branch emits a raw <a href>, which the router never sees, so
 * it does not get the locale basename. Never pass it an app-internal path, or
 * the visitor silently leaves their locale.
 */
export function ButtonLink({
  to,
  children,
  external = false,
  variant = "raised-violet",
  className,
  ariaLabel,
  id,
}: {
  to: string;
  children: React.ReactNode;
  external?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  /**
   * A fuller accessible name than the visible text, for a control repeated
   * once per row, so a screen reader's list of links says which row each
   * belongs to. The visible text stays the first words of this string, so a
   * voice-control user saying "Modifier" still matches (WCAG 2.5.3).
   */
  ariaLabel?: string;
  /** For a screen that moves focus here itself, after deleting a row. */
  id?: string;
}) {
  return (
    <Button asChild variant={variant} className={className}>
      {external ? (
        <a id={id} href={to} target="_blank" rel="noreferrer" aria-label={ariaLabel}>
          {children}
        </a>
      ) : (
        <Link id={id} to={to} aria-label={ariaLabel}>
          {children}
        </Link>
      )}
    </Button>
  );
}
