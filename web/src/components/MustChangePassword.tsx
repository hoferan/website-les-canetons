import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useSession } from "../session/SessionProvider";

const PASSWORD_PAGE = "/account/password";

/**
 * Holds a member on `/account/password` until they have replaced a
 * committee-issued password.
 *
 * WHY A GATE AND NOT JUST A REDIRECT AT LOGIN. The password was read out loud
 * down a phone or written on a slip of paper, so it is not a secret — and a
 * member who logs in, gets sent to /account/password and then simply types another URL
 * would otherwise carry on using it indefinitely. Login sends them here as a
 * courtesy; this is what makes it hold.
 *
 * IT IS NOT AN AUTH GUARD. An anonymous visitor passes straight through: public
 * pages must not depend on being logged in, and there are several.
 *
 * The password page itself is exempt, or the redirect targets the page it is
 * redirecting from and the app renders nothing at all. Only that page: the
 * rest of `/account` is a profile, and a member who must replace a
 * committee-issued password has no reason to sit reading it first (#125).
 *
 * Logout stays reachable throughout, because it lives in the layout
 * chrome rather than on a route — so nobody is trapped in a screen with no way
 * out.
 *
 * THAT SENTENCE WAS FALSE UNTIL 2026-09-14, and it is why nobody noticed: the
 * invariant was documented as satisfied by a control that had never been
 * written. `POST /api/v1/logout` existed and was tested; nothing on screen
 * called it. See web/src/session/logout.ts.
 */
export function MustChangePassword() {
  const { user } = useSession();
  const { pathname } = useLocation();

  if (user?.mustChangePassword && pathname !== PASSWORD_PAGE) {
    // replace, so the browser's back button does not bounce off this gate.
    return <Navigate to={PASSWORD_PAGE} replace />;
  }

  return <Outlet />;
}
