import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets the window's scroll position to the top on every route change.
 *
 * React Router resets NOTHING by default — a `<Link>` swaps the page's
 * content in place and leaves the scroll offset exactly where it was. Noticed
 * on the home page's destination cards, which sit near the bottom of the
 * fixture page: scrolling `/` to the bottom (scrollY 1000) and clicking one
 * landed on `/canetons` still at scrollY 1120, well below its own heading. The
 * cards are where it was seen; the bug is site-wide, because nothing anywhere
 * in this app resets scroll on navigation — every `<Link>` has it.
 *
 * Mounted once in Layout.tsx, which wraps every route and stays mounted
 * across navigations, rather than inside a route element in routes.tsx, where
 * it would remount (and so re-run its effect for the wrong reason) on every
 * page instead of running once and reacting to location changes.
 *
 * KEYED ON PATHNAME, NOT THE FULL LOCATION. /inscriptions_admin?id=1 links to
 * /inscriptions_admin?id=2 for a different event (see PlanningRepet.tsx), and
 * a scroll reset there would yank an admin back to the top of a page whose
 * content hasn't really changed pages. Checked how the app actually mutates
 * search params: no page here rewrites its own query string in place
 * (InscriptionsUtilisateurs.tsx and Login.tsx only ever READ theirs via
 * useSearchParams; InscriptionsAdmin's `?id=` is set by links FROM
 * /planning_repet, a different pathname, which already resets scroll on its
 * own). So a same-pathname, search-only navigation does not occur today — but
 * keying on pathname costs nothing and is the correct guard if one is ever
 * added.
 *
 * HASH IS DELIBERATELY EXCLUDED. A same-page fragment is the browser's own
 * job — see the comment in RegisterIndex.tsx, whose jump links are plain
 * `<a href="#id">` for exactly that reason — and scrolling to the top here
 * would fight it on any router navigation that carries a hash. (A *fresh*
 * load of a hashed URL, e.g. `/canetons#trombones`, is a separate,
 * pre-existing gap: measured, the browser does not scroll to the element
 * either, since the SPA hasn't rendered the section yet when the hash is
 * parsed. That is not touched here — it is not this component's job to fix,
 * and a naive top-reset would only make it worse.)
 *
 * useLayoutEffect, not useEffect: the reset needs to happen before the
 * browser paints the new page at the old offset. useEffect runs after paint,
 * so a heavy page would flash at the stale scroll position for one frame
 * before jumping — useLayoutEffect runs synchronously after the DOM mutates
 * and before the browser paints, so there is nothing to see.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
