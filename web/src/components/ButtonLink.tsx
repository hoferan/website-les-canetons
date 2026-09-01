import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

/**
 * A link that looks like a button.
 *
 * Four places style a Link as a button today — /sinscrire's two actions and
 * SouperCta's call to action — each repeating the primary or secondary class
 * string by hand. Button already carries the variants and the 44px floor, and
 * shadcn's `asChild` (Radix Slot) puts them onto whatever element it wraps, so
 * this is the whole component.
 *
 * `external` exists so an outbound link cannot be added without rel="noreferrer":
 * target="_blank" without it hands the destination a window.opener it can
 * navigate.
 */
export function ButtonLink({
  to,
  children,
  external = false,
  variant = "default",
  className,
}: {
  to: string;
  children: React.ReactNode;
  external?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  return (
    <Button asChild variant={variant} className={className}>
      {external ? (
        <a href={to} target="_blank" rel="noreferrer">
          {children}
        </a>
      ) : (
        <Link to={to}>{children}</Link>
      )}
    </Button>
  );
}
