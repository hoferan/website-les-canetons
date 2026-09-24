import { Inbox, type LucideIcon, Menu, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { Logo } from "./Logo";
import { DesktopNav } from "./DesktopNav";
import { type NavEntry } from "./NavEntry";
import {
  DESK_ACTIVE,
  DESK_IDLE,
  DESK_LINK,
  PHONE_ACTIVE,
  PHONE_IDLE,
  PHONE_ROW,
} from "./navStyles";
import { PhoneNav } from "./PhoneNav";

import { useInboxSummary } from "../api/generated/endpoints";
import { type TranslationKey, t } from "../i18n";
import { Hreflang } from "../i18n/Hreflang";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { AccountDisclosure, AccountDropdown, type AccountTool } from "../session/AccountMenu";
import { useSession } from "../session/SessionProvider";
import { EnvRibbon } from "./EnvRibbon";
import { ScrollToTop } from "./ScrollToTop";
import { Toaster } from "./ui/sonner";

/**
 * The public nav, IN ORDER OF IMPORTANCE, left to right — what a stranger
 * wants, in the order a stranger wants it. The desktop bar folds from the
 * right into "Plus" when it runs out of room, so this order is also the order
 * in which entries disappear (#99).
 *
 * "Nous rejoindre" is first because recruiting is what this site is for: the
 * band takes players from 7 to 18 and loses them at 18, so the visitor worth
 * optimising for is a parent deciding whether to turn up on Saturday. The
 * people page follows, then the way to write in, and last the pages a parent
 * needs least. The gallery, an external site, comes after all of them.
 *
 * EVERY ENTRY HERE MUST BE A ROUTE THAT EXISTS — a nav item that 404s is worse
 * than a missing one.
 */
const PUBLIC_NAV: Array<{ to: string; labelKey: TranslationKey }> = [
  { to: "/join", labelKey: "nav.join" },
  { to: "/agenda", labelKey: "nav.agenda" },
  { to: "/band", labelKey: "nav.band" },
  { to: "/contact", labelKey: "nav.contact" },
  { to: "/committee", labelKey: "nav.committee" },
  { to: "/history", labelKey: "nav.history" },
];

const GALLERY_URL = "https://www.flickr.com/photos/201962767@N02/collections";

/**
 * The committee's screens, each gated by the permission that gates the API
 * route behind it. Under the avatar on desktop, in "Mon espace" on a phone.
 *
 * THE ENTRY IS ABSENT, NOT REFUSED (design §4). A member who cannot use
 * /members never sees the word: showing a link that leads to "Accès refusé"
 * teaches people that parts of the site are broken for them.
 *
 * Gated on a PERMISSION, never a role name — the same rule the middleware and
 * the route guards follow.
 */
const TOOLS: Array<{ to: string; labelKey: TranslationKey; permission: string; icon: LucideIcon }> =
  [
    { to: "/members", labelKey: "nav.members", permission: "members.manage", icon: Users },
    { to: "/inbox", labelKey: "nav.inbox", permission: "messages.view", icon: Inbox },
  ];

export function Layout() {
  const { config, user, can } = useSession();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const active = pathname;
  const close = () => setOpen(false);

  const mayReadInbox = can("messages.view");
  // Disabled rather than gated in the render below: a query that never runs
  // for an anonymous visitor or a member without the permission is the
  // honest way to say "this number is not for you", and it means the
  // permission check happens once here instead of at every read of `.data`.
  const inboxSummary = useInboxSummary({ query: { enabled: user !== null && mayReadInbox } });
  const inboxTotal =
    inboxSummary.data && inboxSummary.data.status === 200 ? inboxSummary.data.data.total : 0;

  // The lists the two navs lay out. Built here, in one place, so the desktop
  // bar and the phone list cannot disagree about what exists.
  const publicEntries: NavEntry[] = [
    ...PUBLIC_NAV.map((item) => ({ key: item.to, to: item.to, label: t(item.labelKey) })),
    { key: "gallery", href: GALLERY_URL, label: t("nav.gallery") },
  ];
  // THE MEMBERS' TOOL, and first when logged in: reading the planning is what
  // everybody in the band does every week, so it is the last thing to fold.
  // Needs a session and nothing more — gating it on a permission would be the
  // same mistake as gating the ability to answer for an event.
  const memberEntries: NavEntry[] = [{ key: "/events", to: "/events", label: t("nav.events") }];
  const tools = TOOLS.filter((item) => can(item.permission));
  const countFor = (to: string) => (to === "/inbox" ? inboxTotal : 0);
  const accountTools: AccountTool[] = tools.map((item) => ({
    to: item.to,
    label: t(item.labelKey),
    icon: item.icon,
    count: countFor(item.to),
  }));
  const toolEntries: NavEntry[] = tools.map((item) => ({
    key: item.to,
    to: item.to,
    label: t(item.labelKey),
    badge:
      countFor(item.to) > 0 ? (
        <span
          aria-label={t("nav.pending", { n: countFor(item.to) })}
          className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-pink px-1.5 py-0.5 text-xs font-semibold text-white"
        >
          {countFor(item.to)}
        </span>
      ) : undefined,
  }));
  const loginLink = (base: string, on: string, off: string) => (
    <Link
      to="/login"
      onClick={close}
      aria-current={active === "/login" ? "page" : undefined}
      className={`${base} font-semibold ${active === "/login" ? on : off}`}
    >
      {t("nav.login")}
    </Link>
  );

  // REFRESHES THE BADGE ON NAVIGATION, AND ONLY THEN — never a timer. Layout
  // wraps every route and never remounts, so TanStack Query's own
  // refetch-on-mount never fires again after the first page load; without
  // this, marking a message handled from /contact-messages (which invalidates
  // this query key itself, see ContactMessages.tsx) is the only way the count
  // would ever move. `isFirstRender` skips the run that would otherwise pair
  // with the query's own initial fetch on mount.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (user !== null && mayReadInbox) {
      void inboxSummary.refetch();
    }
    // inboxSummary and mayReadInbox are deliberately omitted: both are fresh
    // every render, and listing them would refire this on every settle of the
    // query itself rather than only on a route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Renders nothing; resets scroll on pathname change. Mounted here,
          rather than per route in routes.tsx, so it survives navigation
          instead of remounting on every page. See its own doc comment for
          why, including the measured symptom and the hash exclusion. */}
      <ScrollToTop />

      <EnvRibbon env={config.env} />

      <header className="bg-stage text-white">
        <div className="mx-auto flex max-w-shell items-center justify-between gap-3 px-4 py-3">
          {/* The lockup, and the reasoning for splitting the mark from the
              wordmark, both live in Logo.tsx. */}
          <Logo />
          {/* Desktop only. The phone's copy sits in the Menu bar below; see
              LanguageSwitch for why the two differ. */}
          <div className="hidden md:block">
            <LanguageSwitch surface="dark" />
          </div>
        </div>

        {/* NAMED, and it has to be. The band page carries a second nav (the
            register index), and the front page repeats four of these links as
            destination cards — so "the link called Nous rejoindre" matches two
            elements on / and a query has nothing to scope to. Two navs without
            names are also indistinguishable to a screen-reader user moving by
            landmark. */}
        <nav aria-label={t("nav.primary")} className="border-t border-white/10 bg-panel text-ink">
          <div className="flex items-center justify-between pr-2 md:hidden">
            <button
              type="button"
              aria-label={t("nav.menuLabel")}
              aria-expanded={open}
              aria-controls="nav-menu"
              onClick={() => setOpen((wasOpen) => !wasOpen)}
              className="focus-ring flex min-h-touch items-center gap-2 px-4 font-semibold text-ink"
            >
              <Menu className="h-6 w-6" />
              {t("nav.menu")}
            </button>
            <LanguageSwitch surface="light" />
          </div>

          {/* Rendered only while open, so the closed phone menu adds nothing
              to the page and the desktop bar is the only copy a test or a
              screen reader meets at desktop width. */}
          {open ? (
            <PhoneNav
              account={
                user ? <AccountDisclosure member={user} active={active} onDone={close} /> : null
              }
              mine={user ? [...memberEntries, ...toolEntries] : []}
              band={publicEntries}
              login={user ? null : loginLink(PHONE_ROW, PHONE_ACTIVE, PHONE_IDLE)}
              active={active}
              close={close}
            />
          ) : null}

          <DesktopNav
            entries={user ? [...memberEntries, ...publicEntries] : publicEntries}
            active={active}
            trailing={
              user ? (
                <AccountDropdown member={user} active={active} tools={accountTools} />
              ) : (
                loginLink(DESK_LINK, DESK_ACTIVE, DESK_IDLE)
              )
            }
          />
        </nav>
      </header>

      {/* Renders nothing; keeps the head's alternates in step with the page. */}
      <Hreflang />

      <main>
        <Outlet />
      </main>

      {/* NO LOGO HERE, DELIBERATELY. The badge was briefly shown above this
          line and taken out again on 2026-09-03: it is the mark on the flyers
          and the costumes, so it earns one prominent placement rather than a
          repeat in the chrome of every page. That placement is /accueil. */}
      <footer className="mt-16 bg-stage py-8 text-center text-sm text-white/70">
        <p className="mx-auto max-w-shell px-4">
          © {new Date().getFullYear()} Guggenmusik les canetons de Fribourg. {t("nav.rights")}
        </p>
      </footer>

      {/* Mounted once here rather than per page: the layout route survives
          navigation, so a toast raised by a mutation is not unmounted by the
          redirect that follows it. */}
      <Toaster />
    </>
  );
}
