import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Moves focus to the new page's heading after a navigation (#389).
 *
 * A link swaps the page and leaves focus on the link, so a screen-reader user
 * hears nothing and a keyboard user's next Tab carries on through the nav.
 * Focusing the h1 reads the page's name and starts the next Tab in the content.
 * No live region as well: it would say the page twice.
 *
 * Mounted once in Layout, which never remounts. It reads the path without
 * `/de` (LocaleFromUrl), so a change of language is not a navigation and
 * leaves focus on the switch. Keyed on the pathname like ScrollToTop: a
 * search-only change stays on the page, and a fragment is the browser's.
 *
 * The first render is a fresh load, which the browser and the screen reader
 * already announce; only a change from a known pathname moves focus. That
 * also keeps StrictMode's second effect run from focusing anything.
 *
 * A page still loading has no h1 yet: <main> takes focus (it is tabIndex -1
 * for the skip link), and the h1 takes it over when it arrives, unless the
 * user has moved on in the meantime.
 *
 * preventScroll, because ScrollToTop already put the page at the top.
 */
export function RouteFocus() {
  const { pathname, hash } = useLocation();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = pathname;
    if (before === null || before === pathname || hash) return;

    const main = document.getElementById("main");
    if (!main) return;

    const heading = main.querySelector("h1");
    if (heading) {
      focusHeading(heading);
      return;
    }

    main.focus({ preventScroll: true });
    const observer = new MutationObserver(() => {
      if (document.activeElement !== main) {
        observer.disconnect();
        return;
      }
      const late = main.querySelector("h1");
      if (late) {
        observer.disconnect();
        focusHeading(late);
      }
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, hash]);

  return null;
}

/** Focusable by script only, never a tab stop; styles.css drops its outline. */
function focusHeading(heading: HTMLElement) {
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}
