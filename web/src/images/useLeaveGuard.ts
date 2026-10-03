import { useEffect } from "react";

/**
 * Asks before the page is left while `active`.
 *
 * Two ways out are covered. Closing or reloading the tab gets the browser's own
 * `beforeunload` prompt. A click on a link inside the app gets `message` in a
 * confirm, and the navigation is cancelled if the answer is no.
 *
 * WHY NOT react-router's `useBlocker`: it needs a data router, and App.tsx
 * mounts a `<BrowserRouter>`. Moving every route onto `createBrowserRouter`
 * would be the complete answer, since a blocker also sees Back and calls to
 * `navigate()`; this hook covers neither of those.
 *
 * The click is caught on the document in the capture phase, so it runs before
 * React's own listener on the root and before any `<Link>` acts on it. That
 * covers every link at once (the bar, the phone menu, the account menu, the
 * logo) without each one needing to know about the queue. Links that would not
 * leave this page are let through: a new tab, a download, another site (which
 * `beforeunload` handles) and the page's own address.
 */
export function useLeaveGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    const intercept = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target !== "" && link.target !== "_self") || link.hasAttribute("download")) return;

      const to = new URL(link.href, window.location.href);
      const here = window.location;
      if (to.origin !== here.origin) return;
      if (to.pathname === here.pathname && to.search === here.search) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", intercept, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", intercept, true);
    };
  }, [active, message]);
}
