import { ChevronDown, ExternalLink } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@ds";

import { t } from "../i18n";
import { Link } from "../i18n/routing";
import { type NavEntry } from "./NavEntry";
import { DESK_IDLE, DESK_LINK, NAV_HERE } from "./navStyles";

/**
 * The desktop bar's "Plus" menu, in a chunk of its own (#476). DesktopNav
 * draws a plain copy of the trigger until this arrives, and fetches it on the
 * first hover or focus of that copy.
 */
export function MoreMenu({
  folded,
  active,
  open,
  onOpenChange,
  focus,
}: {
  /** The entries that did not fit on the bar. */
  folded: NavEntry[];
  active: string;
  /** Held by DesktopNav, so a press on the plain copy opens this menu whenever it lands. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Takes the focus from the plain copy, which this trigger replaces. */
  focus: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const foldedActive = folded.some((entry) => entry.to === active);

  // Once, on arrival. An open menu moves the focus into itself, and returns it
  // to the trigger when it closes.
  useLayoutEffect(() => {
    if (focus && !open) trigger.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger ref={trigger} className={`${DESK_LINK} group ${DESK_IDLE}`}>
        <span className={foldedActive ? NAV_HERE : undefined}>{t("nav.more")}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-data-[state=open]:rotate-180"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {folded.map(({ icon: Icon, ...entry }) => (
          <DropdownMenuItem key={entry.key} asChild>
            {entry.href !== undefined ? (
              <a href={entry.href} target="_blank" rel="noreferrer" aria-label={entry.ariaLabel}>
                {Icon ? <Icon /> : null}
                {entry.label}
                {Icon ? null : <ExternalLink aria-hidden="true" />}
              </a>
            ) : (
              <Link to={entry.to} aria-current={entry.to === active ? "page" : undefined}>
                {entry.label}
              </Link>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
