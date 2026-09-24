import { ChevronDown, LogOut, User } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { NAV_ROW, NAV_ROW_ACTIVE } from "../components/navStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { t } from "../i18n";
import { useLogout } from "./logout";

type Member = { username: string; firstName: string; lastName: string };

/**
 * The logged-in member's way to "Mon compte" and "Déconnexion".
 *
 * WHY A MENU (#99, decided 2026-09-14). The name and the logout used to sit
 * side by side as nav items, one stray click apart, and putting the logout
 * behind one more tap is enough to stop that. A confirm dialog would stop it
 * too, but logging out is cheap to undo, and a confirm on a reversible action
 * trains people to click through the confirms that matter.
 *
 * TWO SHAPES, ONE PER SCREEN SIZE. The phone gets a disclosure inside the nav
 * list; desktop gets a dropdown under an avatar. The first version used the
 * dropdown on both, and on a phone the popover floated over the page beside
 * the full-width list, detached from the row that opened it. Both are
 * rendered and CSS picks one, so there is no media query to keep in step
 * with Tailwind's `md`.
 */
export function AccountMenu({
  member,
  onAccountPage,
  onDone,
}: {
  member: Member;
  /** True on /account, which marks the control like an active nav item. */
  onAccountPage: boolean;
  /** Closes the phone menu once an item is chosen. */
  onDone: () => void;
}) {
  return (
    <>
      <PhoneDisclosure member={member} onAccountPage={onAccountPage} onDone={onDone} />
      <DesktopDropdown member={member} onAccountPage={onAccountPage} onDone={onDone} />
    </>
  );
}

/** The rows the disclosure opens, indented to line up with the name. */
const PHONE_SUB_ROW =
  "focus-ring flex min-h-12 w-full items-center gap-3 pr-4 pl-14 text-left text-ink-muted hover:text-ink";

function PhoneDisclosure({
  member,
  onAccountPage,
  onDone,
}: {
  member: Member;
  onAccountPage: boolean;
  onDone: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const finish = () => {
    setExpanded(false);
    onDone();
  };
  const { logOut, isPending } = useLogout(finish);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((was) => !was)}
        className={`${NAV_ROW} w-full justify-between gap-3 font-semibold ${onAccountPage ? NAV_ROW_ACTIVE : "text-ink"}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Avatar firstName={member.firstName} lastName={member.lastName} size="sm" />
          <span className="truncate">{member.username}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <ul id={panelId} className="animate-reveal border-t border-line bg-ground">
          <li>
            <Link
              to="/account"
              onClick={finish}
              aria-current={onAccountPage ? "page" : undefined}
              className={`${PHONE_SUB_ROW} ${onAccountPage ? "font-semibold text-violet" : ""}`}
            >
              <User aria-hidden="true" className="size-4" />
              {t("nav.account")}
            </Link>
          </li>
          <li>
            {/* aria-disabled and the guard inside logOut, never `disabled`:
                see the docblock in ui/button.tsx. */}
            <button
              type="button"
              onClick={logOut}
              aria-disabled={isPending}
              className={PHONE_SUB_ROW}
            >
              <LogOut aria-hidden="true" className="size-4" />
              {t("nav.logout")}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Styled here rather than in ui/dropdown-menu, so the row menus on /events and
 * /members keep their own look until somebody decides they should match.
 */
const MENU_ITEM =
  "gap-3 rounded-md px-2.5 text-ink focus:bg-violet/10 focus:text-violet [&_svg]:size-4 [&_svg]:text-ink-muted focus:[&_svg]:text-violet";

function DesktopDropdown({
  member,
  onAccountPage,
  onDone,
}: {
  member: Member;
  onAccountPage: boolean;
  onDone: () => void;
}) {
  const { logOut, isPending } = useLogout(onDone);
  const fullName = `${member.firstName} ${member.lastName}`.trim();

  return (
    <div className="hidden md:block">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("nav.accountMenu", { name: member.username })}
          className="group focus-ring flex min-h-touch items-center gap-1 rounded-full text-ink-muted hover:text-ink"
        >
          {/* The ring is the avatar's "you are here", the same job the
              underline does for the text items beside it. */}
          <span
            className={`rounded-full ${onAccountPage ? "ring-2 ring-violet ring-offset-2" : ""}`}
          >
            <Avatar firstName={member.firstName} lastName={member.lastName} />
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-64 rounded-lg border-line bg-panel p-1.5 shadow-lg"
        >
          {/* WHO IS LOGGED IN, since the trigger shows only initials. On the
              shared family computer this is the line that says whose session
              it is. Plain markup, not a menu item: nothing to select. */}
          <div className="mb-1.5 flex items-center gap-3 border-b border-line px-2.5 pt-1.5 pb-3">
            <Avatar firstName={member.firstName} lastName={member.lastName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {fullName || member.username}
              </p>
              {fullName ? (
                <p className="truncate text-xs text-ink-muted">{member.username}</p>
              ) : null}
            </div>
          </div>

          {/* asChild straight onto Link, for the reason RowActions' ItemFor
              gives: a real anchor survives middle-click, and one Slot layer is
              all it takes for Radix's props to land. */}
          <DropdownMenuItem asChild className={MENU_ITEM}>
            <Link to="/account" onClick={onDone} aria-current={onAccountPage ? "page" : undefined}>
              <User aria-hidden="true" />
              {t("nav.account")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={MENU_ITEM}
            textValue={t("nav.logout")}
            aria-disabled={isPending}
            onSelect={logOut}
          >
            <LogOut aria-hidden="true" />
            {t("nav.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
