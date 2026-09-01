import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

/**
 * A link that looks like a button.
 *
 * It exists because four separate places used to repeat the primary or secondary
 * button class string by hand on a Link. Button already carries the variants and
 * the 44px floor, and shadcn's `asChild` (Radix Slot) puts them onto whatever
 * element it wraps, so this is the whole component.
 *
 * NO COUNT OF CALL SITES HERE, deliberately. This comment used to say "four
 * places … today" and was wrong twice over: it named three, and there are five
 * (SouperCta, NotFound, SignupThanks and /planning_repet's two Résumé links).
 * A tally in a comment is a fact that rots on the next call site; `grep` for
 * `<ButtonLink` answers it correctly forever.
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
