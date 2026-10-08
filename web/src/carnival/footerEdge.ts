import { createContext, useContext, useLayoutEffect } from "react";

/**
 * How a page tells the footer what colour it ends on, so the footer's
 * scalloped top edge can be drawn in it (ADR 0029).
 *
 * Layout owns the value and the footer reads it. A page that ends on the cream
 * says nothing, and the footer keeps its default: a gap of cream, then cream
 * bumps. A page whose last surface is coloured, like the home page's yellow
 * band, names that colour, and the footer then sits flush against it.
 *
 * A context rather than a guess from the DOM: the footer cannot see what the
 * page's last surface is, and reading a computed background would need a
 * layout pass and still fail on a gradient.
 */
export const FooterEdgeContext = createContext<(colour: string | null) => void>(() => {});

/**
 * Sets the colour the footer's edge is drawn in while the calling page is
 * mounted. `null` means the cream, which is also what a route change leaves
 * behind, because the cleanup runs before the next page sets its own.
 */
export function useFooterEdge(colour: string | null) {
  const setEdge = useContext(FooterEdgeContext);
  // A layout effect, so the edge changes in the same frame as the page and a
  // cream bump never flashes under a yellow band.
  useLayoutEffect(() => {
    setEdge(colour);
    return () => setEdge(null);
  }, [colour, setEdge]);
}
