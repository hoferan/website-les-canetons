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
 * A HASHED LOCATION IS LEFT ALONE. A same-page fragment click never reaches
 * this component at all: RegisterIndex.tsx's jump links are plain
 * `<a href="#id">` on purpose, so clicking one is the browser's own job — no
 * router navigation fires, this effect doesn't run, and scrolling to the top
 * here would only fight it.
 *
 * WHAT IS DELIBERATELY *NOT* FIXED HERE, AND WHY IT IS HARDER THAN IT LOOKS.
 * A fresh load of a shared `/canetons#trombones` does not jump to the
 * register: scrollY stays 0 with the section at y=1371, because the browser
 * tries to honour the fragment while the document is first parsed, before the
 * SPA has rendered the section the id belongs to. That is a real gap and it
 * predates this component.
 *
 * An attempt to close it here was reverted on 2026-09-03, and the reason is
 * worth keeping. Calling scrollIntoView from this effect is not enough: the
 * self-hosted Bungee/Karla faces (styles.css) swap in shortly after first
 * paint and reflow every heading, growing the document from 1872px to 2134px,
 * and scrollIntoView clamps to whatever height exists when it runs — so the
 * register landed partway down (y=323). Awaiting `document.fonts.ready` first
 * looked like the answer and measured y=81 on Windows, an exact match for an
 * in-page chip click. **It then measured y=291 in CI on headless Linux.** Two
 * requestAnimationFrames were also tried and were not enough (the swap took
 * three frames, not a fixed count).
 *
 * The lesson: `document.fonts.ready` is a font-loading signal, NOT a
 * "layout has settled" signal, and one scroll fired at a guessed moment is
 * platform-dependent by construction. Doing this properly means observing
 * the element's document offset until it stops moving (a ResizeObserver or a
 * bounded rAF loop that re-asserts while the geometry changes, bailing on real
 * user input), and verifying it on Linux rather than on one developer's
 * machine. That is a self-contained piece of work; it is not a comment tweak,
 * and it should not be smuggled in beside something else.
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
    // A fragment is the browser's business, not ours — see the doc comment for
    // the fresh-load case this deliberately does not try to fix.
    if (hash) return;

    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
