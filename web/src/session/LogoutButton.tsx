import { useAuthLogout } from "../api/generated/endpoints";
import { currentLocale } from "../i18n";
import { pathInLocale } from "../i18n/locale";

/**
 * The way out.
 *
 * IT DID NOT EXIST UNTIL 2026-09-14. `POST /api/v1/logout` was built in R1a
 * and has Laravel tests; nothing on screen had ever called it, so a member's
 * only way to end a session was to clear their cookies — on the shared family
 * computer a young member's parent logs in from, that is the whole problem.
 * Found by André during R2's manual pass.
 *
 * What kept it hidden is worth more than the bug: MustChangePassword's own
 * docblock argued its gate could trap nobody BECAUSE "logout is a button in
 * the layout chrome rather than a route". The invariant was documented as
 * satisfied by a control that was never written. That comment is true now.
 *
 * IN THE CHROME, NOT ON A PAGE, for exactly that reason. A member held on
 * /account by the forced-password gate reaches the nav and nothing else, so a
 * logout living on some other route would be unreachable by the one person who
 * most needs it.
 *
 * A BUTTON, NOT A LINK. It changes server state; there is no /logout URL to
 * bookmark, prefetch, or land on by pressing Back.
 */
export function LogoutButton({ onDone }: { onDone: () => void }) {
  const logout = useAuthLogout({
    mutation: {
      // A FULL PAGE LOAD, NOT A ROUTER NAVIGATION, AND NOT CACHE SURGERY.
      //
      // Three in-app versions were built and measured first, because a reload
      // costs a second and looks lazy. Each failed differently:
      //
      //   1. `queryClient.clear()` then `navigate("/")` LEFT THE CHROME LOGGED
      //      IN — the nav still read "demo.direction" and still offered a
      //      logout on the public front page. SessionProvider's two queries are
      //      mounted with `staleTime: Infinity`, and removing a query does not
      //      make a mounted observer go and ask again.
      //   2. Clearing the SESSION queries as well blanks the document:
      //      SessionProvider renders `null` while they are pending.
      //   3. Removing the private data and INVALIDATING `/me` fixed the
      //      chrome, and then lost a race. The member is on /members when they
      //      click; the refetch resolves before the router has committed the
      //      new location, RequirePermission sees an anonymous user on a page
      //      it guards, and the logout lands on the LOGIN FORM. Measured, not
      //      predicted.
      //
      // Every one of those is the same shape of problem: a live app being
      // rearranged around a session that no longer exists. Throwing the
      // document away removes the category. The heap goes with it, which is a
      // stronger guarantee than any cache surgery on a shared computer — the
      // roster, the planning and the chase list cannot be recovered from
      // memory by pressing Back.
      //
      // TO `/` RATHER THAN `/login`, which is only possible after R2: until
      // this release the front page was the 404 view, so there was nowhere to
      // land. Logging out is finishing, not starting again.
      onSuccess: () => leave(onDone),

      // A FAILED LOGOUT STILL ENDS THE SESSION HERE. The cookie may already be
      // gone — an expired session answers 401 on this very call — and leaving
      // somebody staring at a members' screen because the server disagreed
      // about whether they were logged in is the worst of both. Whatever the
      // server thinks, that session is unusable from this browser.
      onError: () => leave(onDone),
    },
  });

  return (
    <button
      type="button"
      onClick={() => {
        if (logout.isPending) return;
        logout.mutate();
      }}
      // aria-disabled rather than disabled, as everywhere else here: `disabled`
      // blurs the focused control mid-submit and drops the keyboard user
      // somewhere they did not ask to be. The early return above is the guard.
      aria-disabled={logout.isPending}
      className="focus-ring flex min-h-12 w-full items-center px-4 text-left text-white/80 hover:text-white md:min-h-0 md:w-auto md:px-0 md:py-1 md:text-ink-muted md:hover:text-ink"
    >
      Déconnexion
    </button>
  );
}

/**
 * Where logging out lands: the CURRENT LOCALE'S root, not "/".
 *
 * EXPORTED SO IT CAN BE TESTED AT ALL. The navigation below cannot be: this is
 * a real full page load, and window.location is non-configurable in this jsdom
 * setup, so a spy on .assign throws "Cannot redefine property: assign" instead
 * of recording the call. Layout.test.tsx:128-135 documents that, having hit it,
 * and proves the server half only. Splitting the destination out gives the
 * decision a unit test and leaves the landing to a real browser, which is
 * where it was always checked.
 *
 * (An earlier version of this file's docblock claimed Layout.test.tsx spied on
 * assign. It never did, and never could.)
 *
 * THE LOCALE MATTERS because this escapes the router's basename entirely — the
 * one place in web/src/ that does. A literal "/" would drop a German member on
 * the French home page, silently changing their language as a side effect of
 * logging out.
 */
export function logoutDestination(): string {
  return pathInLocale("/", currentLocale());
}

/** Closes the phone menu, then hands the browser back to the public site. */
function leave(onDone: () => void): void {
  onDone();
  window.location.assign(logoutDestination());
}
