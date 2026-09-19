import { ExternalLink, Menu } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { Logo } from "./Logo";

import { useInboxSummary } from "../api/generated/endpoints";
import { type TranslationKey, t } from "../i18n";
import { LogoutButton } from "../session/LogoutButton";
import { useSession } from "../session/SessionProvider";
import { EnvRibbon } from "./EnvRibbon";
import { ScrollToTop } from "./ScrollToTop";
import { Toaster } from "./ui/sonner";

/**
 * The public nav — what a stranger sees, in the order a stranger wants it.
 *
 * "Nous rejoindre" is first because recruiting is what this site is for: the
 * band takes players from 7 to 18 and loses them at 18, so the visitor worth
 * optimising for is a parent deciding whether to turn up on Saturday. The two
 * people pages follow, then the prose, then the way to write in.
 *
 * EVERY ENTRY HERE MUST BE A ROUTE THAT EXISTS — a nav item that 404s is worse
 * than a missing one.
 */
const NAV: Array<{ to: string; labelKey: TranslationKey }> = [
  { to: "/join", labelKey: "nav.join" },
  { to: "/agenda", labelKey: "nav.agenda" },
  { to: "/band", labelKey: "nav.band" },
  { to: "/committee", labelKey: "nav.committee" },
  { to: "/history", labelKey: "nav.history" },
  { to: "/contact", labelKey: "nav.contact" },
];

/**
 * Screens grouped under "Direction", each gated by the permission that gates
 * the API route behind it.
 *
 * THE GROUP IS ABSENT, NOT REFUSED (design §4). A member who cannot use
 * /members never sees the word: showing a link that leads to "Accès refusé"
 * teaches people that parts of the site are broken for them.
 *
 * Gated on a PERMISSION, never a role name — the same rule the middleware and
 * the route guards follow.
 */
const DIRECTION_NAV: Array<{ to: string; labelKey: TranslationKey; permission: string }> = [
  { to: "/members", labelKey: "nav.members", permission: "members.manage" },
  { to: "/inbox", labelKey: "nav.inbox", permission: "messages.view" },
];

/**
 * THE THIRD NAV CATEGORY: needs a session and nothing more.
 *
 * Neither public like Galerie nor permission-gated like Membres. Reading the
 * planning is something everybody in the band does, so gating it on a
 * permission would be the same mistake as gating the ability to answer for an
 * event — but it is not for strangers either, because R1c is the members' tool
 * and the public planning is R2's (C1).
 *
 * An array rather than an entry special-cased inside the map, for the reason
 * NAV_ROW exists: a rule applied by hand is a rule that lasts until the next
 * item is added.
 */
const MEMBER_NAV: Array<{ to: string; labelKey: TranslationKey }> = [
  { to: "/events", labelKey: "nav.events" },
];

/**
 * One nav row. On a phone this is a 48px full-width row on the dark stage
 * surface, with a divider; above `md` it collapses back to an inline item on
 * the light bar.
 *
 * Extracted because there are TWELVE call sites — ten links, the Flickr anchor
 * and the auth item — and the phone nav's targets were about 24px before this,
 * roughly half the 44px minimum. A rule applied by hand twelve times is a rule
 * that lasts until the next item is added.
 */
const NAV_ROW = "focus-ring flex min-h-12 items-center px-4 md:min-h-0 md:px-0 md:py-1";

/**
 * The active item is PINK on the dark phone panel and violet on the light
 * desktop bar: violet on --color-stage does not carry enough contrast, and pink
 * is exactly the "emphasis, never a whole surface" role the palette reserves.
 */
const NAV_ROW_ACTIVE = "font-semibold text-pink md:border-b-2 md:border-violet md:text-violet";
const NAV_ROW_IDLE = "text-white/80 hover:text-white md:text-ink-muted md:hover:text-ink";

/** The divider between phone rows, gone above `md`. */
const NAV_ITEM = "border-b border-white/10 last:border-0 md:border-0";

/**
 * One internal nav row. Extracted when the third category arrived and the
 * same nine lines would have been written a third time — see NAV_ROW's own
 * comment on rules applied by hand.
 *
 * Link, not NavLink: NavLink's own aria-current is gated by its internal
 * isActive, which matches `to` literally against the URL. Link leaves
 * aria-current and className to us instead.
 */
function NavItem({
  to,
  labelKey,
  active,
  close,
  badge,
}: {
  to: string;
  labelKey: TranslationKey;
  active: string;
  close: () => void;
  /** Trailing content, e.g. the inbox's unread count — absent for every
   *  other entry. */
  badge?: ReactNode;
}) {
  return (
    <li className={NAV_ITEM}>
      <Link
        to={to}
        onClick={close}
        aria-current={active === to ? "page" : undefined}
        className={`${NAV_ROW} ${active === to ? NAV_ROW_ACTIVE : NAV_ROW_IDLE}`}
      >
        {t(labelKey)}
        {badge}
      </Link>
    </li>
  );
}

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
        <div className="mx-auto flex max-w-shell items-center gap-3 px-4 py-3">
          {/* The lockup, and the reasoning for splitting the mark from the
              wordmark, both live in Logo.tsx. */}
          <Logo />
        </div>

        {/* NAMED, and it has to be. The band page carries a second nav (the
            register index), and the front page repeats four of these links as
            destination cards — so "the link called Nous rejoindre" matches two
            elements on / and a query has nothing to scope to. Two navs without
            names are also indistinguishable to a screen-reader user moving by
            landmark. */}
        <nav aria-label={t("nav.primary")} className="border-t border-white/10 bg-panel text-ink">
          <button
            type="button"
            aria-label={t("nav.menuLabel")}
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="focus-ring flex min-h-touch items-center gap-2 px-4 font-semibold text-ink md:hidden"
          >
            <Menu className="h-6 w-6" />
            {t("nav.menu")}
          </button>

          <ul
            id="nav-menu"
            className={`${open ? "block" : "hidden"} animate-reveal border-t border-white/10 bg-stage text-sm md:mx-auto md:flex md:max-w-shell md:flex-wrap md:items-center md:gap-5 md:border-0 md:bg-panel md:px-4 md:py-2`}
          >
            {NAV.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                labelKey={item.labelKey}
                active={active}
                close={close}
              />
            ))}

            {/* Logged in, whatever they can do. */}
            {user
              ? MEMBER_NAV.map((item) => (
                  <NavItem
                    key={item.to}
                    to={item.to}
                    labelKey={item.labelKey}
                    active={active}
                    close={close}
                  />
                ))
              : null}

            {DIRECTION_NAV.filter((item) => can(item.permission)).map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                labelKey={item.labelKey}
                active={active}
                close={close}
                // Special-cased on `to` rather than a field on every
                // DIRECTION_NAV entry: the inbox is the only one with a live
                // count today, and a badge nobody else needs is not a
                // property worth giving every other entry.
                badge={
                  item.to === "/inbox" && inboxTotal > 0 ? (
                    <span
                      data-testid="inbox-badge"
                      aria-label={t("nav.pending", { n: inboxTotal })}
                      className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-pink px-1.5 py-0.5 text-xs font-semibold text-white"
                    >
                      {inboxTotal}
                    </span>
                  ) : undefined
                }
              />
            ))}

            <li className={NAV_ITEM}>
              {/* External: a plain anchor, not a NavLink. */}
              <a
                href="https://www.flickr.com/photos/201962767@N02/collections"
                target="_blank"
                rel="noreferrer"
                className={`${NAV_ROW} ${NAV_ROW_IDLE}`}
              >
                {t("nav.gallery")} <ExternalLink className="inline h-4 w-4 align-middle" />
              </a>
            </li>

            {/* HIDDEN 2026-08-31 with its route — see web/src/routes.tsx for why.
                The "Galerie" link above is current and stays: it is now the only
                media destination in the nav.
            <li className={NAV_ITEM}>
              <Link
                to="/multimedia"
                onClick={() => setOpen(false)}
                aria-current={active === "/multimedia" ? "page" : undefined}
                className={`${NAV_ROW} ${active === "/multimedia" ? NAV_ROW_ACTIVE : NAV_ROW_IDLE}`}
              >
                Multimédia
              </Link>
            </li>
            */}

            {/* Points at /account once somebody is logged in: their own name
                leading back to a login form is a dead end, and /account is the
                one screen every account holder has. */}
            <li className={`nav-auth ${NAV_ITEM} md:ml-auto`}>
              <NavLink
                to={user ? "/account" : "/login"}
                onClick={() => setOpen(false)}
                className={`${NAV_ROW} font-semibold ${NAV_ROW_IDLE}`}
              >
                {user ? user.username : t("nav.login")}
              </NavLink>
            </li>

            {/* THE WAY OUT, and it is here rather than on /account because the
                forced-password gate lets a member reach the chrome and nothing
                else. See LogoutButton for what its absence had been costing
                since R1a. */}
            {user ? (
              <li className={NAV_ITEM}>
                <LogoutButton onDone={close} />
              </li>
            ) : null}
          </ul>
        </nav>
      </header>

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
