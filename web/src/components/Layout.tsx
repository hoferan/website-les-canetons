import { ExternalLink, Menu } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { Logo } from "./Logo";

import { useSession } from "../session/SessionProvider";
import { EnvRibbon } from "./EnvRibbon";
import { Toaster } from "./ui/sonner";

/**
 * Link set and ORDER copied from the deleted app/partials/navigation.php
 * (`git show dcd7862^:app/partials/navigation.php`). It is neither alphabetical
 * nor the route table's order — it is the order the band is used to, so it is
 * reproduced rather than tidied.
 */
const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/commencement", label: "Commencer les Canetons" },
  { to: "/comite_teamdirection", label: "Contact Canetons" },
  { to: "/canetons", label: "Les canetons" },
  { to: "/moniteurs", label: "Moniteurs" },
  { to: "/planning_repet", label: "Événements" },
  // HIDDEN 2026-08-31 with its route — see web/src/routes.tsx for why.
  // { to: "/cd", label: "CD" },
  // HIDDEN 2026-08-31 with its route — see web/src/routes.tsx for why.
  // { to: "/sponsors", label: "Sponsors et liens amis" },
  { to: "/historique", label: "Historique" },
];

/**
 * The two inscription sub-pages highlight the "Événements" item, matching the
 * old setActiveNavigation() behaviour. They pointed at /sinscrire until that
 * page was merged into /planning_repet on 2026-09-01.
 */
const ACTIVE_ALIASES: Record<string, string> = {
  "/inscriptions_admin": "/planning_repet",
  "/inscriptions_utilisateurs": "/planning_repet",
};

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

export function Layout() {
  const { config, user } = useSession();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const active = ACTIVE_ALIASES[pathname] ?? pathname;

  return (
    <>
      <EnvRibbon env={config.env} />

      <header className="bg-stage text-white">
        <div className="mx-auto flex max-w-shell items-center gap-3 px-4 py-3">
          {/* The lockup, and the reasoning for splitting the mark from the
              wordmark, both live in Logo.tsx. */}
          <Logo />
        </div>

        <nav className="border-t border-white/10 bg-panel text-ink">
          <button
            type="button"
            aria-label="Menu de navigation"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="focus-ring flex min-h-touch items-center gap-2 px-4 font-semibold text-ink md:hidden"
          >
            <Menu className="h-6 w-6" />
            Menu
          </button>

          <ul
            id="nav-menu"
            className={`${open ? "block" : "hidden"} border-t border-white/10 bg-stage text-sm md:mx-auto md:flex md:max-w-shell md:flex-wrap md:items-center md:gap-5 md:border-0 md:bg-panel md:px-4 md:py-2`}
          >
            {NAV.map((item) => (
              <li key={item.to} className={NAV_ITEM}>
                {/*
                  Link, not NavLink: NavLink's own aria-current is gated by its
                  internal isActive, which matches `to` literally against the
                  URL and has no idea about ACTIVE_ALIASES below. Link leaves
                  aria-current and className to us, so the alias page and the
                  real page agree.
                */}
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  aria-current={active === item.to ? "page" : undefined}
                  className={`${NAV_ROW} ${active === item.to ? NAV_ROW_ACTIVE : NAV_ROW_IDLE}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}

            <li className={NAV_ITEM}>
              {/* External: a plain anchor, not a NavLink. */}
              <a
                href="https://www.flickr.com/photos/201962767@N02/collections"
                target="_blank"
                rel="noreferrer"
                className={`${NAV_ROW} ${NAV_ROW_IDLE}`}
              >
                Galerie <ExternalLink className="inline h-4 w-4 align-middle" />
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

            <li className={`nav-auth ${NAV_ITEM} md:ml-auto`}>
              <NavLink
                to="/authentification_inscription"
                onClick={() => setOpen(false)}
                className={`${NAV_ROW} font-semibold ${NAV_ROW_IDLE}`}
              >
                {user ? user.username : "Connexion"}
              </NavLink>
            </li>
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
          © {new Date().getFullYear()} Guggenmusik les canetons de Fribourg. Tous droits réservés.
        </p>
      </footer>

      {/* Mounted once here rather than per page: the layout route survives
          navigation, so a toast raised by a mutation is not unmounted by the
          redirect that follows it. */}
      <Toaster />
    </>
  );
}
