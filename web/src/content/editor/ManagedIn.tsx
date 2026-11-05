import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { t } from "../../i18n";
import { useSession } from "../../session/SessionProvider";
import { useEditMode } from "../EditMode";
import { ChipLink, CHIP_ROOM } from "./EditChip";

/**
 * Wraps a block that shows data, not content the band types on the page. In
 * edit mode, for someone holding `permission`, it adds a link chip to the page
 * where that data is managed and the room for it above the block, so the chip
 * covers nothing. Everyone else gets the children as they are.
 *
 * The permission is the one the target page needs: a link to "Accès refusé"
 * reads as a broken site, so it is absent rather than refused.
 */
export function ManagedIn({
  to,
  page,
  permission,
  className,
  children,
}: {
  to: string;
  /** The destination page's name, already in the page's language. */
  page: string;
  permission: string;
  className?: string;
  children: ReactNode;
}) {
  const { on } = useEditMode();
  const { can } = useSession();
  const shown = on && can(permission);

  return (
    <div className={cn(shown && ["relative", CHIP_ROOM], className)}>
      {shown ? <ChipLink to={to} label={t("blockEditor.managedIn", { page })} /> : null}
      {children}
    </div>
  );
}
