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
 * A HASHED LOCATION SCROLLS ITS OWN ELEMENT INTO VIEW, NOT THE TOP. A same-page
 * fragment click never reaches this component at all: RegisterIndex.tsx's jump
 * links are plain `<a href="#id">` on purpose, so clicking one is the
 * browser's own job — no router navigation fires, so this effect doesn't run,
 * and scrolling to the top here would only fight it.
 *
 * What DOES reach this component is a *fresh* load of a hashed URL, e.g. a
 * shared or bookmarked `/canetons#trombones`. Measured: window.scrollY stayed
 * 0 with the target section at y=1371, because the browser tries to honour
 * the fragment while the document is first parsed, before the SPA has
 * rendered the section the id belongs to — an SPA cannot rely on the browser
 * for this. So the hash branch ACTS rather than abstains: it looks the
 * element up by id and scrolls it into view, falling back to doing nothing
 * when a stale or hand-typed fragment matches no element (must not throw,
 * must not yank the page).
 *
 * WAITS ON document.fonts.ready FIRST — measured, not assumed. The element is
 * always in the DOM by the time this effect runs (SessionProvider gates the
 * whole router on GET /api/config and GET /api/user, so Layout and the routed
 * page commit together in one React pass — no separate "page not mounted yet"
 * race). But calling scrollIntoView immediately on that first commit still
 * under-scrolled: self-hosted Bungee/Karla (styles.css) swap in shortly after
 * first paint, and that font swap reflows every heading on the page, growing
 * its total scrollable height. scrollIntoView clamps its target to whatever
 * height exists at the moment it runs, so calling it before the swap lands the
 * register partway down the viewport instead of at the top — measured y=323 for
 * #trombones (last register, so worst-affected) against y=81 from an in-page
 * chip click on the same section once fonts had settled. Two rAFs after mount
 * were not enough — the swap took three frames in testing, not a fixed count —
 * so this waits on the browser's own signal for "fonts have finished loading
 * and any resulting reflow has happened" rather than guessing a frame count or
 * a timeout. Confirmed empirically: with the wait, the fresh-load y matches the
 * chip-click y exactly (81, scrollY 1290 both).
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
    if (hash) {
      // The lookup is deliberately INSIDE the callback, not captured before the
      // await: by the time fonts settle the visitor may have navigated on, and
      // then there is no element with this id and this correctly does nothing.
      const jump = () => document.getElementById(hash.slice(1))?.scrollIntoView();

      // Optional-chained, and it falls through to jumping immediately. This runs
      // in a LAYOUT effect, so a throw here does not merely skip a scroll — it
      // propagates out of the commit and takes the whole page down. document.fonts
      // is the Font Loading API: present in every browser this site targets, absent
      // in jsdom (setupTests.ts stubs it) and in anything older, and not worth a
      // blank site to depend on.
      if (document.fonts?.ready) void document.fonts.ready.then(jump);
      else jump();

      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
