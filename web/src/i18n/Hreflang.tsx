import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { htmlLang, pathInLocale, DEFAULT_LOCALE, LOCALES } from "./locale";

/** Marks the tags this component owns, so it never removes anybody else's. */
const OWNED = "data-hreflang-alternate";

/**
 * The `hreflang` alternates, kept in step with the page.
 *
 * Injected at runtime, because one SPA shell serves every path and the three
 * environments share a promoted bundle, so `index.html` cannot carry per-page
 * alternates.
 *
 * Absolute URLs from `window.location.origin`, as `hreflang` requires; unlike
 * the shell's `og:` tags, they need no baked-in canonical domain.
 *
 * x-default points at French, the band's default, the same choice main.tsx
 * makes by not reading `navigator.language`.
 */
export function Hreflang() {
  // The router's location only signals a navigation. The paths come from
  // window.location, which keeps the `/de` basename useLocation() strips.
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
