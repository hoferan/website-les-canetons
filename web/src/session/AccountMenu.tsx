import { type LucideIcon, LogOut, User } from "lucide-react";
import { Link } from "react-router-dom";

import { Avatar } from "../components/Avatar";
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
 * A menu keeps the logout one tap away from a stray click. There is no confirm
 * dialog: logging out is cheap to undo, and a confirm on a reversible action
 * trains people to click through the confirms that matter.
 *
 * Desktop only. The avatar's menu also holds the committee's screens, so the
 * bar can keep to pages. On the phone the account actions are the footer of
 * PhoneNav's full-screen layer, because a popover there floats detached from
 * the row that opened it.
 */

/** The desktop half: the right end of DesktopNav. */
export function AccountDropdown({
  member,
  active,
  tools,
  showAccount,
}: {
  member: Member;
  active: string;
  tools: AccountTool[];
  /** Whether the reader may open /account, decided by Layout like every entry. */
  showAccount: boolean;
}) {
  return (
    <DesktopDropdown
      member={member}
      active={active}
      tools={tools}
      showAccount={showAccount}
      onDone={() => {}}
    />
  );
}

function DesktopDropdown({
  member,
  active,
  tools,
  showAccount,
  onDone,
}: {
  member: Member;
  active: string;
  tools: AccountTool[];
  showAccount: boolean;
  onDone: () => void;
}) {
  const { logOut, isPending } = useLogout(onDone);
  const fullName = `${member.firstName} ${member.lastName}`.trim();
  const pending = tools.reduce((sum, tool) => sum + (tool.count ?? 0), 0);
  // The avatar's "you are here", like the yellow highlight on the text entries:
  // anywhere under /account, or on any screen the menu leads to.
  const here = active.startsWith("/account") || tools.some((tool) => tool.to === active);
  const name = t("nav.accountMenu", { name: member.username });

  return (
    <DropdownMenu>
      {/* No chevron: an avatar top right is a control everybody knows. */}
      <DropdownMenuTrigger
        aria-label={pending > 0 ? `${name}, ${t("nav.pending", { n: pending })}` : name}
        className="focus-ring-stage relative flex min-h-touch min-w-touch items-center justify-center rounded-full"
      >
        <span
          className={`rounded-full ${here ? "ring-2 ring-yellow ring-offset-2 ring-offset-stage" : ""}`}
        >
          <Avatar firstName={member.firstName} lastName={member.lastName} />
        </span>
        {pending > 0 ? (
          <span
            data-testid="inbox-badge"
            aria-hidden="true"
            className="absolute -top-0.5 -right-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-stage bg-pink px-1 text-xs leading-4 font-semibold text-ink"
          >
            {pending}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        {/* Who is logged in, since the trigger shows only initials and a
            family may share a computer. Plain markup: nothing to select. */}
        <div className="mb-1.5 flex items-center gap-3 border-b border-line px-2.5 pt-1.5 pb-3">
          <Avatar firstName={member.firstName} lastName={member.lastName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{fullName || member.username}</p>
            {fullName ? <p className="truncate text-xs text-ink-muted">{member.username}</p> : null}
          </div>
        </div>

        {/* asChild straight onto Link, as in RowActions' ItemFor: a real
            anchor survives middle-click, and one Slot layer lets Radix's
            props land. */}
        {showAccount ? (
          <DropdownMenuItem asChild>
            <Link to="/account" aria-current={active === "/account" ? "page" : undefined}>
              <User aria-hidden="true" />
              {t("nav.account")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {tools.map((tool) => (
          <DropdownMenuItem key={tool.to} asChild>
            <Link to={tool.to} aria-current={active === tool.to ? "page" : undefined}>
              <tool.icon aria-hidden="true" />
              {tool.label}
              {tool.count ? (
                <span
                  aria-label={t("nav.pending", { n: tool.count })}
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-pink px-1.5 text-xs leading-5 font-semibold text-ink"
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
