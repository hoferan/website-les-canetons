import { ExternalLink } from "lucide-react";
import { type ComponentType, type ReactNode } from "react";
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
} & (
  | { to: string; href?: never; icon?: never; ariaLabel?: never }
  | {
      href: string;
      to?: never;
      /**
       * A brand mark, drawn in front of the label in place of the trailing
       * "external" arrow. The desktop bar shows the mark alone.
       */
      icon?: ComponentType<{ className?: string }>;
      /** The link's whole name, which says the link opens a new tab. */
      ariaLabel?: string;
    }
);

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
  iconOnly = false,
}: {
  entry: NavEntry;
  active: boolean;
  className: string;
  onClick?: () => void;
  /** Drop the label of an entry that has a mark. */
  iconOnly?: boolean;
}) {
  if (entry.href !== undefined) {
    const Icon = entry.icon;
    // rel=noreferrer: without it a target=_blank link hands the opened page a
    // window.opener reference back into this one.
    return (
      <a
        href={entry.href}
        target="_blank"
        rel="noreferrer"
        aria-label={entry.ariaLabel}
        className={className}
        onClick={onClick}
      >
        {Icon ? <Icon className="size-5 shrink-0" /> : null}
        {Icon && iconOnly ? null : entry.label}
        {Icon ? null : <ExternalLink aria-hidden="true" className="size-4 shrink-0" />}
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
