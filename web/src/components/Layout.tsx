import { ExternalLink, Menu } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

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

      <header>
        <div className="flex items-center gap-4 px-4 py-3">
          <img
            src="/assets/img/Les_Canetons_Fribourg_logo_2.jpg"
            alt="Logo"
            className="h-16 w-auto"
          />
          <h1 className="text-xl font-bold">Guggenmusik Les Canetons de Fribourg</h1>
        </div>

        <nav>
          <button
            type="button"
            aria-label="Menu de navigation"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="m-2 md:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>

          <ul
            id="nav-menu"
            className={`${open ? "block" : "hidden"} px-4 pb-3 md:flex md:flex-wrap md:gap-4`}
          >
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={active === item.to ? "font-bold underline" : undefined}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}

            <li>
              {/* External: a plain anchor, not a NavLink. */}
              <a
                href="https://www.flickr.com/photos/201962767@N02/collections"
                target="_blank"
                rel="noreferrer"
              >
                Galerie <ExternalLink className="inline h-4 w-4 align-middle" />
              </a>
            </li>

            <li>
              <NavLink
                to="/multimedia"
                onClick={() => setOpen(false)}
                className={active === "/multimedia" ? "font-bold underline" : undefined}
              >
                Multimédia
              </NavLink>
            </li>

            <li className="nav-auth">
              <NavLink to="/authentification_inscription" onClick={() => setOpen(false)}>
                {user ? user.username : "Connexion"}
              </NavLink>
            </li>
          </ul>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mt-12 border-t py-6 text-center text-sm text-gray-600">
        <p>
          © {new Date().getFullYear()} Guggenmusik les canetons de Fribourg. Tous droits réservés.
        </p>
      </footer>
    </>
  );
}
