import { ChevronDown, type LucideIcon, LogOut, User } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { PHONE_ROW, PHONE_ACTIVE } from "../components/navStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { t } from "../i18n";
import { useLogout } from "./logout";

type Member = { username: string; firstName: string; lastName: string };

/** A screen reached from the avatar on desktop: Membres, Boîte de réception. */
export type AccountTool = { to: string; label: string; icon: LucideIcon; count?: number };

/**
 * The logged-in member's way to "Mon compte" and "Déconnexion".
 *
 * WHY A MENU (#99, decided 2026-09-14). The name and the logout used to sit
 * side by side as nav items, one stray click apart, and putting the logout
 * behind one more tap is enough to stop that. A confirm dialog would stop it
 * too, but logging out is cheap to undo, and a confirm on a reversible action
 * trains people to click through the confirms that matter.
 *
 * TWO SHAPES, ONE PER SCREEN SIZE. The phone gets a disclosure at the top of
 * the nav list; desktop gets a dropdown under an avatar, which also holds the
 * committee's screens so the bar can keep to pages. The first version used the
 * dropdown on both, and on a phone the popover floated over the page beside
 * the full-width list, detached from the row that opened it.
 */

/** The phone half: the first row of PhoneNav when somebody is logged in. */
export function AccountDisclosure({
  member,
  active,
  onDone,
}: {
  member: Member;
  active: string;
  onDone: () => void;
}) {
  return <PhoneDisclosure member={member} onAccountPage={active === "/account"} onDone={onDone} />;
}

/** The desktop half: the right end of DesktopNav. */
export function AccountDropdown({
  member,
  active,
  tools,
}: {
  member: Member;
  active: string;
  tools: AccountTool[];
}) {
  return <DesktopDropdown member={member} active={active} tools={tools} onDone={() => {}} />;
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
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((was) => !was)}
        className={`${PHONE_ROW} justify-between gap-3 font-semibold ${onAccountPage ? PHONE_ACTIVE : "text-ink"}`}
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

function DesktopDropdown({
  member,
  active,
  tools,
  onDone,
}: {
  member: Member;
  active: string;
  tools: AccountTool[];
  onDone: () => void;
}) {
  const { logOut, isPending } = useLogout(onDone);
  const fullName = `${member.firstName} ${member.lastName}`.trim();
  const pending = tools.reduce((sum, tool) => sum + (tool.count ?? 0), 0);
  // The avatar's "you are here", the job the underline does for the text
  // entries beside it: on /account or on any screen the menu leads to.
  const here = active === "/account" || tools.some((tool) => tool.to === active);
  const name = t("nav.accountMenu", { name: member.username });

  return (
    <DropdownMenu>
      {/* NO CHEVRON. An avatar top right is a control everybody already
          knows to click. */}
      <DropdownMenuTrigger
        aria-label={pending > 0 ? `${name}, ${t("nav.pending", { n: pending })}` : name}
        className="focus-ring relative flex min-h-touch min-w-touch items-center justify-center rounded-full"
      >
        <span className={`rounded-full ${here ? "ring-2 ring-violet ring-offset-2" : ""}`}>
          <Avatar firstName={member.firstName} lastName={member.lastName} />
        </span>
        {pending > 0 ? (
          <span
            data-testid="inbox-badge"
            aria-hidden="true"
            className="absolute -top-0.5 -right-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-panel bg-pink px-1 text-xs leading-4 font-semibold text-white"
          >
            {pending}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        {/* WHO IS LOGGED IN, since the trigger shows only initials. On the
            shared family computer this is the line that says whose session
            it is. Plain markup, not a menu item: nothing to select. */}
        <div className="mb-1.5 flex items-center gap-3 border-b border-line px-2.5 pt-1.5 pb-3">
          <Avatar firstName={member.firstName} lastName={member.lastName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{fullName || member.username}</p>
            {fullName ? <p className="truncate text-xs text-ink-muted">{member.username}</p> : null}
          </div>
        </div>

        {/* asChild straight onto Link, for the reason RowActions' ItemFor
            gives: a real anchor survives middle-click, and one Slot layer is
            all it takes for Radix's props to land. */}
        <DropdownMenuItem asChild>
          <Link to="/account" aria-current={active === "/account" ? "page" : undefined}>
            <User aria-hidden="true" />
            {t("nav.account")}
          </Link>
        </DropdownMenuItem>
        {tools.map((tool) => (
          <DropdownMenuItem key={tool.to} asChild>
            <Link to={tool.to} aria-current={active === tool.to ? "page" : undefined}>
              <tool.icon aria-hidden="true" />
              {tool.label}
              {tool.count ? (
                <span
                  aria-label={t("nav.pending", { n: tool.count })}
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-pink px-1.5 text-xs leading-5 font-semibold text-white"
                >
                  {tool.count}
                </span>
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem textValue={t("nav.logout")} aria-disabled={isPending} onSelect={logOut}>
          <LogOut aria-hidden="true" />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
