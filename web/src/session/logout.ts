import { useAuthLogout } from "../api/generated/endpoints";
import { currentLocale } from "../i18n";
import { pathInLocale } from "../i18n/locale";

/**
 * The way out.
 *
 * It lives in the nav chrome, not on a page: a member held on /account by the
 * forced-password gate (MustChangePassword) reaches the nav and nothing else.
 *
 * An action, not a link: it changes server state, so there is no /logout URL
 * to bookmark, prefetch or land on by pressing Back.
 *
 * A hook, because AccountMenu and PhoneNav render the control; this owns what
 * selecting it does.
 */
export function useLogout(onDone: () => void): { logOut: () => void; isPending: boolean } {
  const logout = useAuthLogout({
    mutation: {
      // A full page load, not a router navigation or cache surgery. In-app
      // versions each rearrange a live app around a dead session:
      //
      //   - `queryClient.clear()` leaves the chrome logged in, because
      //     SessionProvider's mounted `staleTime: Infinity` observers do not
      //     ask again when their query is removed.
      //   - Clearing the session queries too blanks the document, since
      //     SessionProvider renders `null` while they are pending.
      //   - Invalidating `/me` races the navigation: RequirePermission sees an
      //     anonymous user on the guarded page and lands on the login form.
      //
      // The reload also drops the heap, so on a shared computer the roster
      // cannot come back by pressing Back. It lands on the home page, not
      // the login form.
      onSuccess: () => leave(onDone),

      // A failed logout still ends the session here. An expired session
      // answers 401 on this very call, and whatever the server thinks, the
      // session is unusable from this browser.
      onError: () => leave(onDone),
    },
  });

  return {
    logOut: () => {
      if (logout.isPending) return;
      logout.mutate();
    },
    isPending: logout.isPending,
  };
}

/**
 * Where logging out lands: the current locale's root.
 *
 * Exported so it can be tested. The navigation cannot be: window.location is
 * non-configurable in this jsdom setup, so a spy on .assign throws "Cannot
 * redefine property: assign". Layout.test.tsx's `ends the session on the
 * server` proves the server half only, and a real browser checks the landing.
 *
 * This is the one place in web/src/ that escapes the router's basename, so a
 * literal "/" would drop a German member on the French home page.
 */
export function logoutDestination(): string {
  return pathInLocale("/", currentLocale());
}

/** Closes the phone menu, then hands the browser back to the public site. */
function leave(onDone: () => void): void {
  onDone();
  window.location.assign(logoutDestination());
}
