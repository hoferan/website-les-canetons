import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useSession } from "../session/SessionProvider";

/**
 * Holds a member on `/account` until they have replaced a committee-issued
 * password.
 *
 * WHY A GATE AND NOT JUST A REDIRECT AT LOGIN. The password was read out loud
 * down a phone or written on a slip of paper, so it is not a secret — and a
 * member who logs in, gets sent to /account and then simply types another URL
 * would otherwise carry on using it indefinitely. Login sends them here as a
 * courtesy; this is what makes it hold.
 *
 * IT IS NOT AN AUTH GUARD. An anonymous visitor passes straight through: public
 * pages must not depend on being logged in, and R2 adds several.
 *
 * `/account` itself is exempt, or the redirect targets the page it is
 * redirecting from and the app renders nothing at all.
 *
 * Logout stays reachable throughout, because it is a button in the layout
 * chrome rather than a route — so nobody is trapped in a screen with no way out.
 */
export function MustChangePassword() {
  const { user } = useSession();
  const { pathname } = useLocation();

  if (user?.mustChangePassword && pathname !== "/account") {
    // replace, so the browser's back button does not bounce off this gate.
    return <Navigate to="/account" replace />;
  }

  return <Outlet />;
}
