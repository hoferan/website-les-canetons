import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets the window's scroll position to the top on every route change.
 *
 * React Router resets nothing by default: a `<Link>` swaps the page's content
 * and leaves the scroll offset where it was. Mounted once in Layout.tsx,
 * which stays mounted across navigations, so the effect runs on location
 * changes and not on every remount.
 *
 * Keyed on pathname, not the full location: a navigation that changes only
 * the search string stays on the same page and keeps its offset.
 *
 * A hashed location is left alone. RegisterIndex's jump links are plain
 * `<a href="#id">`, so the browser scrolls to the fragment and this would
 * only fight it.
 *
 * A fresh load of a shared `/band#<register>` does not jump to the register:
 * the browser honours the fragment before the SPA has rendered the section.
 * A scrollIntoView here lands short, because the self-hosted fonts swap in
 * after first paint and reflow the page. `document.fonts.ready` signals font
 * loading, not settled layout: waiting on it lands right on Windows and short
 * on headless Linux, and a fixed number of animation frames is not enough
 * either. A fix has to watch the element's offset until it stops moving
 * (bailing on user input) and be verified on Linux.
 *
 * useLayoutEffect so the reset happens before the browser paints the new page
 * at the old offset.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    // A fragment is the browser's job; see above for the fresh-load case.
    if (hash) return;

    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
