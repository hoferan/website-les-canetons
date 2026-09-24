import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { t } from "../i18n";
import { useLogout } from "./logout";

/**
 * The logged-in member's name, as a menu holding "Mon compte" and
 * "Déconnexion".
 *
 * WHY A MENU (#99, decided 2026-09-14). The name and the logout used to sit
 * side by side as nav items, one stray click apart, and putting the logout
 * inside a menu is enough to stop that. A confirm dialog would stop it too,
 * but logging out is cheap to undo, and a confirm on a reversible action
 * trains people to click through the confirms that matter.
 *
 * The classes come from Layout, so this row matches its neighbours and needs
 * to know nothing about the surface it sits on.
 */
export function AccountMenu({
  username,
  onAccountPage,
  className,
  onDone,
}: {
  username: string;
  /** True on /account. Marks the trigger like an active nav item. */
  onAccountPage: boolean;
  className: string;
  /** Closes the phone menu once an item is chosen. */
  onDone: () => void;
}) {
  const { logOut, isPending } = useLogout(onDone);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`${className} w-full gap-1 text-left md:w-auto`}>
        {username}
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* asChild straight onto Link, for the reason RowActions' ItemFor
            gives: a real anchor survives middle-click, and one Slot layer is
            all it takes for Radix's props to land. */}
        <DropdownMenuItem asChild>
          <Link to="/account" onClick={onDone} aria-current={onAccountPage ? "page" : undefined}>
            {t("nav.account")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* aria-disabled and the guard inside logOut, never `disabled`: see
            the docblock in ui/button.tsx. */}
        <DropdownMenuItem aria-disabled={isPending} onSelect={logOut}>
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
