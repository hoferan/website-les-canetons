import {
  Calendar,
  Drum,
  Images,
  Inbox,
  type LucideIcon,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { Logo } from "./Logo";
import { DesktopNav } from "./DesktopNav";
import { type NavEntry } from "./NavEntry";
import { type MemberEntry, PhoneNav } from "./PhoneNav";

import { useInboxSummary } from "../api/generated/endpoints";
import { FooterEdgeContext } from "../carnival/footerEdge";
import { type TranslationKey, t } from "../i18n";
import { Hreflang } from "../i18n/Hreflang";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { AccountDropdown, type AccountTool } from "../session/AccountMenu";
import { useSession } from "../session/SessionProvider";
import { EnvRibbon } from "./EnvRibbon";
import { Footer } from "./Footer";
import { ScrollToTop } from "./ScrollToTop";
import {
  FACEBOOK_URL,
  FacebookMark,
  FlickrMark,
  GALLERY_URL,
  INSTAGRAM_URL,
  InstagramMark,
} from "./social";
import { buttonVariants } from "./ui/button";
import { Toaster } from "./ui/sonner";
import { cn } from "@/lib/utils";

/**
 * The public nav in order of importance, left to right. The desktop bar folds
 * from the right into "Plus" when it runs out of room, so this is also the
 * order in which entries disappear (#99).
 *
 * "Nous rejoindre" is first because recruiting is what this site is for: the
 * band takes players from 7 to 18, so the visitor worth optimising for is a
 * parent deciding whether to turn up on Saturday. The pages a parent needs
 * least come last, then the external sites, which fold first.
 *
 * Every entry must be a route that exists.
 */
const PUBLIC_NAV: Array<{ to: string; labelKey: TranslationKey }> = [
  { to: "/join", labelKey: "nav.join" },
  { to: "/agenda", labelKey: "nav.agenda" },
  { to: "/band", labelKey: "nav.band" },
  { to: "/contact", labelKey: "nav.contact" },
  { to: "/committee", labelKey: "nav.committee" },
  { to: "/history", labelKey: "nav.history" },
];

/**
 * The committee's screens, each gated by the permission that gates the API
 * route behind it. Under the avatar on desktop, in "Mon espace" on a phone.
 *
 * A member without the permission never sees the entry: a link that leads to
 * "Accès refusé" teaches people that parts of the site are broken for them.
 * Gated on a permission, never a role name (ADR 0014).
 */
const TOOLS: Array<{ to: string; labelKey: TranslationKey; permission: string; icon: LucideIcon }> =
  [
    // First, beside Événements: the tags label the planning.
    { to: "/event-tags", labelKey: "nav.eventTags", permission: "events.manage", icon: Tags },
    { to: "/members", labelKey: "nav.members", permission: "members.manage", icon: Users },
    { to: "/inbox", labelKey: "nav.inbox", permission: "messages.view", icon: Inbox },
    { to: "/media", labelKey: "nav.media", permission: "images.manage", icon: Images },
    { to: "/registers", labelKey: "nav.registers", permission: "members.manage", icon: Drum },
    { to: "/roles", labelKey: "nav.roles", permission: "roles.manage", icon: ShieldCheck },
  ];

export function Layout() {
  const { config, user, can } = useSession();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // The colour the page ends on, for the footer's scalloped edge. Null is the
  // cream; see carnival/footerEdge.ts.
  const [footerEdge, setFooterEdge] = useState<string | null>(null);
  // Every link in the phone layer closes it on click, but a route change can
  // also come from Back or from a redirect, and the layer covers the whole
  // screen, so it must never outlive the page it was opened on.
  useEffect(() => setOpen(false), [pathname]);
  const active = pathname;

  const mayReadInbox = can("messages.view");
  // Disabled for anyone who may not read the inbox, so the permission check
  // happens once here instead of at every read of `.data`.
  const inboxSummary = useInboxSummary({ query: { enabled: user !== null && mayReadInbox } });
  const inboxTotal =
    inboxSummary.data && inboxSummary.data.status === 200 ? inboxSummary.data.data.total : 0;

  // Built in one place so the desktop bar and the phone list cannot disagree
  // about what exists.
  const publicEntries: NavEntry[] = [
    ...PUBLIC_NAV.map((item) => ({ key: item.to, to: item.to, label: t(item.labelKey) })),
    {
      key: "gallery",
      href: GALLERY_URL,
      label: t("nav.gallery"),
      ariaLabel: t("nav.galleryLabel"),
      icon: FlickrMark,
    },
    {
      key: "instagram",
      href: INSTAGRAM_URL,
      label: "Instagram",
      ariaLabel: t("nav.instagramLabel"),
      icon: InstagramMark,
      iconOnly: true,
    },
    {
      key: "facebook",
      href: FACEBOOK_URL,
      label: "Facebook",
      ariaLabel: t("nav.facebookLabel"),
      icon: FacebookMark,
      iconOnly: true,
    },
  ];
  // The planning comes first when logged in: everybody in the band reads it
  // every week, so it is the last thing to fold. Shown on `events.view`, the
  // permission its route asks for; the account link answers to
  // `account.manage` the same way.
  const mayReadPlanning = can("events.view");
  const mayManageAccount = can("account.manage");
  const memberEntries: NavEntry[] = mayReadPlanning
    ? [{ key: "/events", to: "/events", label: t("nav.events") }]
    : [];
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
    ...(mayReadPlanning
      ? [{ key: "/events", to: "/events", label: t("nav.events"), icon: Calendar }]
      : []),
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

  // Refreshes the badge on navigation, never on a timer. Layout wraps every
  // route and never remounts, so the query's refetch-on-mount fires only
  // once. `isFirstRender` skips the run that would double that first fetch.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (user !== null && mayReadInbox) {
      void inboxSummary.refetch();
    }
    // inboxSummary and mayReadInbox are omitted: both are fresh every render,
    // and listing them would refire this on every settle of the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Mounted here rather than per route, so it survives navigation. */}
      <ScrollToTop />

      {/* The skip link, first in the tab order (#15). Hidden until focused.
          Following it focuses <main>, which is why that carries tabIndex -1. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-panel focus:px-4 focus:py-3 focus:text-ink focus:outline-2 focus:outline-violet"
      >
        {t("nav.skipToContent")}
      </a>

      <EnvRibbon env={config.env} />

      <header className="bg-stage text-white">
        <div className="mx-auto flex max-w-shell items-center justify-between gap-3 px-4 py-3 md:pb-0">
          <Logo />
          {/* Desktop only. The phone's copy sits in the Menu bar below; see
              LanguageSwitch for why the two differ. */}
          <div className="hidden md:block">
            <LanguageSwitch />
          </div>
        </div>
      </header>

      {/* Named, because the band page carries a second nav (the register
          index) and the front page repeats four of these links as
          destination cards. Unnamed navs are indistinguishable to a
          screen-reader user moving by landmark.

          A sibling of the header so it can stick: a sticky element only
          sticks within its parent. On a phone the Menu bar stays at the top;
          the desktop bar scrolls away.

          On the stage, like the header (ADR 0029). The desktop entries keep
          a row of their own: beside the full lockup and the language switch
          only three fit before "Plus" at 1280px, and nav.spec.ts pins that
          nothing folds there. */}
      <nav
        aria-label={t("nav.primary")}
        className="sticky top-0 z-30 bg-stage text-white md:static"
      >
        <PhoneNav
          open={open}
          onOpenChange={setOpen}
          member={user}
          mine={user ? mineEntries : []}
          band={publicEntries}
          active={active}
          showAccount={mayManageAccount}
        />

        <DesktopNav
          entries={user ? [...memberEntries, ...publicEntries] : publicEntries}
          active={active}
          trailing={
            user ? (
              <AccountDropdown
                member={user}
                active={active}
                tools={accountTools}
                showAccount={mayManageAccount}
              />
            ) : (
              // The raised yellow button, its shadow pink because ink vanishes
              // on the stage.
              <Link
                to="/login"
                aria-current={active === "/login" ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: "raised" }),
                  "focus-ring-stage border-2 px-3.5 shadow-raised-stage",
                )}
              >
                {t("nav.login")}
              </Link>
            )
          }
        />
      </nav>

      {/* Renders nothing; keeps the head's alternates in step with the page. */}
      <Hreflang />

      {/* tabIndex -1 so the skip link can move focus here; it is never a tab stop.

          min-h-dvh keeps the footer below the first screen, so it is not
          pushed down when a page's data arrives (a layout shift, #236). The
          cost is a footer one scroll away on a page shorter than the screen. */}
      <main id="main" tabIndex={-1} className="min-h-dvh outline-none">
        <FooterEdgeContext.Provider value={setFooterEdge}>
          <Outlet />
        </FooterEdgeContext.Provider>
      </main>

      <Footer above={footerEdge} />

      {/* Mounted once here, so a toast raised by a mutation survives the
          redirect that follows it. */}
      <Toaster />
    </>
  );
}
