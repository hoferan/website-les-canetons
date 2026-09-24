import { LogOut, Menu, User, X, type LucideIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode } from "react";
import { Link } from "react-router-dom";

import { t } from "../i18n";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { useLogout } from "../session/logout";
import { Avatar } from "./Avatar";
import { type NavEntry, EntryLink } from "./NavEntry";

type Member = { username: string; firstName: string; lastName: string };

/** A member's own screen, with the icon its row carries in the overlay. */
export type MemberEntry = {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: ReactNode;
};

/**
 * The phone's Menu bar and the menu it opens: "Scène" (#99).
 *
 * A FULL-SCREEN BLACK LAYER, NOT A LIST PUSHED INTO THE PAGE. The previous
 * version pushed a white list into the page under the white Menu bar, and a
 * design review found it did not read as a menu at all: nothing marked where
 * it ended, it had no close control, the brand went away the moment it
 * opened, and every row carried the same muted weight between some fifteen
 * hairlines. The layer is the stage colour, has a real ✕, and closes on Esc;
 * Radix's Dialog gives it the focus trap and the scroll lock.
 *
 * WHAT GOES WHERE:
 * - the member's own screens first, in a card, because that is what a member
 *   opens the menu for: Événements every week, and the committee's screens;
 * - then the public pages in the display face, "Nous rejoindre" underlined in
 *   pink, the one emphasis the palette allows, because it is what the site is
 *   for;
 * - the account last, in a footer. It was the first and heaviest row, and it
 *   is the least used.
 *
 * THE CURRENT PAGE IS A VIOLET PILL, not violet text. Violet text on the stage
 * is about 2.5:1, which is why the dark panel was once given up; white text on
 * a violet fill is about 7.9:1.
 *
 * RENDERED INSIDE THE NAV, NOT IN A PORTAL, so the links stay inside the
 * "Navigation principale" landmark.
 */
export function PhoneNav({
  open,
  onOpenChange,
  member,
  mine,
  band,
  active,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null when nobody is logged in. */
  member: Member | null;
  /** The member's own screens. Empty when nobody is logged in. */
  mine: MemberEntry[];
  band: NavEntry[];
  active: string;
}) {
  const close = () => onOpenChange(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center justify-between pr-2 md:hidden">
        <Dialog.Trigger
          aria-label={t("nav.menuLabel")}
          className="focus-ring flex min-h-touch items-center gap-2 px-4 font-semibold text-ink"
        >
          <Menu aria-hidden="true" className="size-6" />
          {t("nav.menu")}
        </Dialog.Trigger>
        <LanguageSwitch surface="light" />
      </div>

      <Dialog.Content
        id="nav-menu"
        aria-describedby={undefined}
        className="fixed inset-0 z-40 flex animate-reveal flex-col overflow-y-auto bg-stage text-white md:hidden"
      >
        <Dialog.Title className="sr-only">{t("nav.menu")}</Dialog.Title>

        <div className="flex items-center justify-between py-2 pr-2 pl-4">
          <Link
            to="/"
            onClick={close}
            aria-label="Les Canetons de Fribourg"
            className="focus-ring-stage rounded"
          >
            <img
              src="/assets/img/duck-white.png"
              alt=""
              width={139}
              height={172}
              className="h-10 w-auto"
            />
          </Link>
          <div className="flex items-center">
            <LanguageSwitch surface="dark" />
            <Dialog.Close
              aria-label={t("nav.close")}
              className="focus-ring-stage inline-flex min-h-touch min-w-touch items-center justify-center rounded"
            >
              <X aria-hidden="true" className="size-6" />
            </Dialog.Close>
          </div>
        </div>

        {mine.length > 0 ? (
          <ul
            aria-label={t("nav.groupMine")}
            className="mx-4 mt-2 rounded-2xl bg-white/[0.07] p-1.5"
          >
            {mine.map((entry) => {
              const here = entry.to === active;
              const Icon = entry.icon;
              return (
                <li key={entry.key}>
                  <Link
                    to={entry.to}
                    onClick={close}
                    aria-current={here ? "page" : undefined}
                    className={`focus-ring-stage flex min-h-13 items-center gap-3 rounded-xl px-3 text-base font-semibold ${here ? "bg-violet" : ""}`}
                  >
                    <Icon aria-hidden="true" className={`size-5 ${here ? "" : "text-white/70"}`} />
                    {entry.label}
                    {entry.badge}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        <ul aria-label={t("nav.groupBand")} className="mt-4 px-3 pb-6">
          {band.map((entry) => {
            const here = entry.to === active;
            const recruit = entry.key === "/join";
            return (
              <li key={entry.key}>
                <EntryLink
                  entry={entry}
                  active={here}
                  onClick={close}
                  className={`focus-ring-stage flex min-h-12 items-center gap-2 rounded-xl px-3 font-display text-xl uppercase ${here ? "bg-violet" : ""} ${recruit && !here ? "underline decoration-pink decoration-2 underline-offset-[6px]" : ""}`}
                />
              </li>
            );
          })}
        </ul>

        {member ? (
          <AccountFooter member={member} active={active} close={close} />
        ) : (
          <div className="mt-auto px-4 pb-6">
            <Link
              to="/login"
              onClick={close}
              aria-current={active === "/login" ? "page" : undefined}
              className="focus-ring-stage flex min-h-12 items-center justify-center rounded-xl bg-violet font-semibold"
            >
              {t("nav.login")}
            </Link>
          </div>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

/**
 * Who is logged in, and the two account actions, pinned to the foot of the
 * layer. Sticky rather than fixed, so on a short phone the list scrolls under
 * it and nothing is hidden behind it.
 */
function AccountFooter({
  member,
  active,
  close,
}: {
  member: Member;
  active: string;
  close: () => void;
}) {
  const { logOut, isPending } = useLogout(close);

  const fullName = `${member.firstName} ${member.lastName}`.trim();
  const action =
    "focus-ring-stage inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.07] px-3 text-sm font-semibold";

  return (
    <div className="sticky bottom-0 mt-auto border-t border-white/10 bg-stage px-4 pt-3 pb-4">
      {/* WHO IS LOGGED IN, on a line of its own: squeezed in beside the two
          actions the username truncated to "demo.di…" at 390px. */}
      <p className="flex items-center gap-3">
        <Avatar firstName={member.firstName} lastName={member.lastName} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{fullName || member.username}</span>
          {fullName ? (
            <span className="block truncate text-xs text-white/70">{member.username}</span>
          ) : null}
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <Link
          to="/account"
          onClick={close}
          aria-current={active === "/account" ? "page" : undefined}
          className={`${action} ${active.startsWith("/account") ? "bg-violet" : ""}`}
        >
          <User aria-hidden="true" className="size-4" />
          {t("nav.account")}
        </Link>
        {/* aria-disabled and the guard inside logOut, never `disabled`: see
            the docblock in ui/button.tsx. */}
        <button type="button" onClick={logOut} aria-disabled={isPending} className={action}>
          <LogOut aria-hidden="true" className="size-4" />
          {t("nav.logout")}
        </button>
      </div>
    </div>
  );
}
