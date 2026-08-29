import { ExternalLink, Menu } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { useSession } from "../session/SessionProvider";
import { EnvRibbon } from "./EnvRibbon";

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
  { to: "/planning_repet", label: "Planning et répétitions" },
  { to: "/sinscrire", label: "Inscriptions" },
  { to: "/cd", label: "CD" },
  { to: "/sponsors", label: "Sponsors et liens amis" },
  { to: "/historique", label: "Historique" },
];

/**
 * The two inscription sub-pages highlight the "Inscriptions" item, matching the
 * old setActiveNavigation() behaviour.
 */
const ACTIVE_ALIASES: Record<string, string> = {
  "/inscriptions_admin": "/sinscrire",
  "/inscriptions_utilisateurs": "/sinscrire",
};

export function Layout() {
  const { config, user } = useSession();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const active = ACTIVE_ALIASES[pathname] ?? pathname;

  return (
    <>
      <EnvRibbon env={config.env} />

      <header className="bg-stage text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          <img
            src="/assets/img/Les_Canetons_Fribourg_logo_2.jpg"
            alt="Logo"
            className="h-16 w-auto rounded"
          />
          {/* A <p>, not an <h1>. The page's own title is the document's single
              h1; a site name repeated in the header of every page is branding,
              not the heading of the content below it. Two h1s per page is what
              this was before, on all sixteen routes. */}
          <p className="font-display text-2xl leading-none">
            Les <span className="text-pink">Canetons</span> de Fribourg
          </p>
        </div>

        <nav className="border-t border-white/10 bg-panel text-ink">
          <button
            type="button"
            aria-label="Menu de navigation"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="m-2 rounded p-1 text-ink md:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>

          <ul
            id="nav-menu"
            className={`${open ? "block" : "hidden"} mx-auto max-w-5xl px-4 pb-3 text-sm md:flex md:flex-wrap md:items-center md:gap-5 md:py-2`}
          >
            {NAV.map((item) => (
              <li key={item.to}>
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
                  className={
                    active === item.to
                      ? "border-b-2 border-violet py-1 font-semibold text-violet"
                      : "py-1 text-ink-muted hover:text-ink"
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}

            <li>
              {/* External: a plain anchor, not a NavLink. */}
              <a
                href="https://www.flickr.com/photos/201962767@N02/collections"
                target="_blank"
                rel="noreferrer"
                className="py-1 text-ink-muted hover:text-ink"
              >
                Galerie <ExternalLink className="inline h-4 w-4 align-middle" />
              </a>
            </li>

            <li>
              <Link
                to="/multimedia"
                onClick={() => setOpen(false)}
                aria-current={active === "/multimedia" ? "page" : undefined}
                className={
                  active === "/multimedia"
                    ? "border-b-2 border-violet py-1 font-semibold text-violet"
                    : "py-1 text-ink-muted hover:text-ink"
                }
              >
                Multimédia
              </Link>
            </li>

            <li className="nav-auth">
              <NavLink
                to="/authentification_inscription"
                onClick={() => setOpen(false)}
                className="py-1 font-semibold text-ink-muted hover:text-ink"
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

      <footer className="mt-16 bg-stage py-8 text-center text-sm text-white/70">
        <p className="mx-auto max-w-5xl px-4">
          © {new Date().getFullYear()} Guggenmusik les canetons de Fribourg. Tous droits réservés.
        </p>
      </footer>
    </>
  );
}
