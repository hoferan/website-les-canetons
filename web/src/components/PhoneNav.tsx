import { LogOut, Menu, User, X, type LucideIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Confetti } from "../carnival/Confetti";
import { t } from "../i18n";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { useLogout } from "../session/logout";
import { Avatar } from "./Avatar";
import { type NavEntry, EntryLink } from "./NavEntry";
import { NAV_HERE } from "./navStyles";
import { buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

type Member = { username: string; firstName: string; lastName: string };

/** A member's own screen, with the icon its row carries in the overlay. */
export type MemberEntry = {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: ReactNode;
};

/** The page markers, in order down the list; the mock-up's sequence. */
const MARKERS = ["bg-pink", "bg-yellow", "bg-cyan", "bg-lime", "bg-lilac"];

/** The carnival colours that show on the stage. Lilac is too pale beside them. */
const MENU_CONFETTI = [
  "var(--color-pink)",
  "var(--color-yellow)",
  "var(--color-cyan)",
  "var(--color-lime)",
];

/**
 * The phone's Menu bar and the full-screen layer it opens (#99). The layer has
 * the stage colour, a real ✕ and closes on Esc, so it reads as a menu; Radix's
 * Dialog gives it the focus trap and the scroll lock.
 *
 * What goes where:
 * - the member's own screens first, in a card, because that is what a member
 *   opens the menu for;
 * - then the public pages in the display face, "Nous rejoindre" underlined in
 *   pink because it is what the site is for;
 * - the account last, in a footer, as the least used.
 *
 * It shares the pages' marks (ADR 0029): the current page in yellow under ink,
 * a coloured marker before each page, Connexion as the raised yellow button,
 * and confetti on the empty stage, kept off every row by
 * `data-confetti-avoid`.
 *
 * Rendered inside the nav, not in a portal, so the links stay inside the
 * "Navigation principale" landmark.
 */
export function PhoneNav({
  open,
  onOpenChange,
  member,
  mine,
  band,
  active,
  showAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null when nobody is logged in. */
  member: Member | null;
  /** The member's own screens. Empty when nobody is logged in. */
  mine: MemberEntry[];
  band: NavEntry[];
  active: string;
  /** Whether the reader may open /account, decided by Layout like every entry. */
  showAccount: boolean;
}) {
  const close = () => onOpenChange(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center justify-between pr-2 md:hidden">
        <Dialog.Trigger
          aria-label={t("nav.menuLabel")}
          className="focus-ring-stage flex min-h-touch items-center gap-2 px-4 font-semibold"
        >
          <Menu aria-hidden="true" className="size-6" />
          {t("nav.menu")}
        </Dialog.Trigger>
        <LanguageSwitch />
      </div>

      <Dialog.Content
        id="nav-menu"
        aria-describedby={undefined}
        className="fixed inset-0 z-40 flex animate-reveal flex-col overflow-y-auto bg-stage text-white md:hidden"
      >
        <Dialog.Title className="sr-only">{t("nav.menu")}</Dialog.Title>

        {/* Behind everything below, which is why each of those is
            `relative`: a positioned element paints over in-flow ones. */}
        <Confetti seed={5} colours={MENU_CONFETTI} density={4} />

        <div
          data-confetti-avoid
          className="relative flex items-center justify-between py-2 pr-2 pl-4"
        >
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
            <LanguageSwitch />
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
            data-confetti-avoid
            className="relative mx-4 mt-2 rounded-2xl bg-white/[0.07] p-1.5"
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
                    className={`focus-ring-stage flex min-h-13 items-center gap-3 rounded-xl px-3 text-base font-semibold ${here ? "bg-yellow text-ink" : ""}`}
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

        <ul aria-label={t("nav.groupBand")} className="relative mt-4 px-3 pb-6">
          {band.map((entry, index) => {
            const here = entry.to === active;
            const recruit = entry.key === "/join";
            return (
              <li key={entry.key} data-confetti-avoid>
                {/* The marker sits in a box as wide as the brand marks of the
                    external entries, so every label starts at one edge. */}
                <EntryLink
                  entry={entry}
                  active={here}
                  onClick={close}
                  leading={
                    <span aria-hidden="true" className="flex w-5 shrink-0 justify-center">
                      <span
                        className={`size-3 rotate-[20deg] rounded-[4px] ${MARKERS[index % MARKERS.length]}`}
                      />
                    </span>
                  }
                  labelClassName={here ? NAV_HERE : undefined}
                  className={`focus-ring-stage flex min-h-13 items-center gap-3 rounded-xl px-2 font-display text-[22px] uppercase ${recruit && !here ? "underline decoration-pink decoration-2 underline-offset-[6px]" : ""}`}
                />
              </li>
            );
          })}
        </ul>

        {member ? (
          <AccountFooter member={member} active={active} close={close} showAccount={showAccount} />
        ) : (
          <div data-confetti-avoid className="relative mt-auto px-4 pb-6">
            <Link
              to="/login"
              onClick={close}
              aria-current={active === "/login" ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "raised" }),
                "focus-ring-stage flex h-12 w-full text-base shadow-raised-stage",
              )}
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
  showAccount,
}: {
  member: Member;
  active: string;
  close: () => void;
  showAccount: boolean;
}) {
  const { logOut, isPending } = useLogout(close);

  const fullName = `${member.firstName} ${member.lastName}`.trim();
  const action =
    "focus-ring-stage inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.07] px-3 text-sm font-semibold";

  return (
    <div
      data-confetti-avoid
      className="sticky bottom-0 mt-auto border-t border-white/10 bg-stage px-4 pt-3 pb-4"
    >
      {/* Who is logged in, on a line of its own: beside the two actions the
          username truncates at 390px. */}
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
        {showAccount ? (
          <Link
            to="/account"
            onClick={close}
            aria-current={active === "/account" ? "page" : undefined}
            className={cn(action, active.startsWith("/account") && "bg-yellow text-ink")}
          >
            <User aria-hidden="true" className="size-4" />
            {t("nav.account")}
          </Link>
        ) : null}
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
