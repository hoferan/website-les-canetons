import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { htmlLang, pathInLocale, DEFAULT_LOCALE, LOCALES } from "./locale";

/** Marks the tags this component owns, so it never removes anybody else's. */
const OWNED = "data-hreflang-alternate";

/**
 * The `hreflang` alternates, kept in step with the page.
 *
 * HELD BACK UNTIL THE LAST SLICE, deliberately. These point crawlers at the
 * German mount, and pointing them at half-translated pages is worse than
 * pointing them nowhere — so #159 is the gate for this and not #151.
 *
 * INJECTED AT RUNTIME because the deployed artifact is one SPA shell serving
 * every path: `index.html` cannot carry per-page alternates, and the three
 * environments share a promoted bundle.
 *
 * ABSOLUTE URLS FROM `window.location.origin`, which is what `hreflang`
 * requires and is also why this sidesteps the constraint at index.html:20-31 —
 * the canonical domain is baked into the shell precisely because a crawler
 * resolves a relative `og:image` poorly, and reading the origin at runtime
 * needs no such decision. The shell's own `og:` tags and `<title>` are still
 * French on every German page; that is a separate question about a static
 * document and is filed on its own.
 *
 * x-default POINTS AT FRENCH. It is what a crawler uses when it matches no
 * listed language, and this is a Fribourg band whose default is French — the
 * same choice main.tsx makes by not reading `navigator.language`.
 */
export function Hreflang() {
  // The router's location, used ONLY as the signal that navigation happened.
  // The paths below come from window.location, which still carries the
  // `/de` basename that useLocation() has stripped.
  const location = useLocation();

  useEffect(() => {
    const head = document.head;
    for (const stale of head.querySelectorAll(`link[${OWNED}]`)) {
      stale.remove();
    }

    const { origin, pathname, search } = window.location;

    const add = (hreflang: string, locale: (typeof LOCALES)[number]) => {
      const link = document.createElement("link");
      link.setAttribute(OWNED, "");
      link.rel = "alternate";
      link.hreflang = hreflang;
      // No hash: a fragment is a position within a page, not a different one.
      link.href = `${origin}${pathInLocale(pathname, locale)}${search}`;
      head.append(link);
    };

    for (const locale of LOCALES) {
      add(htmlLang(locale), locale);
    }
    add("x-default", DEFAULT_LOCALE);

    return () => {
      for (const own of head.querySelectorAll(`link[${OWNED}]`)) {
        own.remove();
      }
    };
  }, [location.pathname, location.search]);

  return null;
}
