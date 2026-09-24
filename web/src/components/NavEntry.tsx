import { ExternalLink } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * One nav destination: an internal route, or an external site that opens in a
 * new tab. Layout builds the list; the desktop bar and the phone list only
 * decide how to lay it out.
 */
export type NavEntry = {
  key: string;
  label: string;
  /** Trailing content, e.g. the inbox's unread count. */
  badge?: ReactNode;
} & ({ to: string; href?: never } | { href: string; to?: never });

/**
 * Link, not NavLink: NavLink's own aria-current is gated by its internal
 * isActive, which matches `to` literally against the URL. Link leaves
 * aria-current and className to us instead.
 */
export function EntryLink({
  entry,
  active,
  className,
  onClick,
}: {
  entry: NavEntry;
  active: boolean;
  className: string;
  onClick?: () => void;
}) {
  if (entry.href !== undefined) {
    // rel=noreferrer: without it a target=_blank link hands the opened page a
    // window.opener reference back into this one.
    return (
      <a href={entry.href} target="_blank" rel="noreferrer" className={className} onClick={onClick}>
        {entry.label}
        <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
      </a>
    );
  }

  return (
    <Link
      to={entry.to}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {entry.label}
      {entry.badge}
    </Link>
  );
}
