import { Calendar, Inbox, type LucideIcon, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { Logo } from "./Logo";
import { DesktopNav } from "./DesktopNav";
import { type NavEntry } from "./NavEntry";
import { DESK_ACTIVE, DESK_IDLE, DESK_LINK } from "./navStyles";
import { type MemberEntry, PhoneNav } from "./PhoneNav";

import { useInboxSummary } from "../api/generated/endpoints";
import { type TranslationKey, t } from "../i18n";
import { Hreflang } from "../i18n/Hreflang";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { AccountDropdown, type AccountTool } from "../session/AccountMenu";
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
 * THE ENTRY IS ABSENT, NOT REFUSED. A member who cannot use
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
  // Every link in the phone layer closes it on click, but a route change can
  // also come from Back or from a redirect, and the layer covers the whole
  // screen, so it must never outlive the page it was opened on.
  useEffect(() => setOpen(false), [pathname]);
  const active = pathname;

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
  // The phone layer's "mine" card: Événements, then the committee's screens,
  // each with its icon and the inbox with its count.
  const mineEntries: MemberEntry[] = [
    { key: "/events", to: "/events", label: t("nav.events"), icon: Calendar },
    ...tools.map((item) => ({
      key: item.to,
      to: item.to,
      label: t(item.labelKey),
      icon: item.icon,
      badge:
        countFor(item.to) > 0 ? (
          <span
            aria-label={t("nav.pending", { n: countFor(item.to) })}
            className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-pink px-1.5 py-0.5 text-xs font-semibold text-ink"
          >
            {countFor(item.to)}
          </span>
        ) : undefined,
    })),
  ];

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

      {/* THE SKIP LINK, first in the tab order (#15). The header and the nav
          are ten stops on the desktop front page before the content starts.
          Hidden until focused, then pinned over the header's top left. A
          plain fragment link: following it focuses <main>, which is why that
          element carries tabIndex -1. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-panel focus:px-4 focus:py-3 focus:text-ink focus:outline-2 focus:outline-violet"
      >
        {t("nav.skipToContent")}
      </a>

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
      </header>

      {/* NAMED, and it has to be. The band page carries a second nav (the
          register index), and the front page repeats four of these links as
          destination cards — so "the link called Nous rejoindre" matches two
          elements on / and a query has nothing to scope to. Two navs without
          names are also indistinguishable to a screen-reader user moving by
          landmark.

          A SIBLING OF THE HEADER, NOT INSIDE IT, so that it can stick: a
          sticky element only sticks within its parent, and inside the header
          it would scroll away with it. On a phone the Menu bar stays at the
          top, so the menu opens from anywhere on a long page; the desktop bar
          scrolls away as before. */}
      <nav
        aria-label={t("nav.primary")}
        className="sticky top-0 z-30 border-b border-line bg-panel text-ink md:static md:border-b-0"
      >
        <PhoneNav
          open={open}
          onOpenChange={setOpen}
          member={user}
          mine={user ? mineEntries : []}
          band={publicEntries}
          active={active}
        />

        <DesktopNav
          entries={user ? [...memberEntries, ...publicEntries] : publicEntries}
          active={active}
          trailing={
            user ? (
              <AccountDropdown member={user} active={active} tools={accountTools} />
            ) : (
              <Link
                to="/login"
                aria-current={active === "/login" ? "page" : undefined}
                className={`${DESK_LINK} font-semibold ${active === "/login" ? DESK_ACTIVE : DESK_IDLE}`}
              >
                {t("nav.login")}
              </Link>
            )
          }
        />
      </nav>

      {/* Renders nothing; keeps the head's alternates in step with the page. */}
      <Hreflang />

      {/* tabIndex -1 so the skip link can move focus here; it is never a tab stop. */}
      <main id="main" tabIndex={-1} className="outline-none">
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
