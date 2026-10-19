import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useSession } from "../session/SessionProvider";

const PASSWORD_PAGE = "/account/password";

/**
 * Holds a member on `/account/password` until they have replaced a
 * committee-issued password.
 *
 * A gate, not only a redirect at login: the password was read out over the
 * phone or written on a slip of paper, so it is no secret, and a member who
 * simply typed another URL would keep using it. Login sends them here as a
 * courtesy; this makes it hold.
 *
 * It is not an auth guard: an anonymous visitor passes straight through, since
 * public pages must not depend on being logged in.
 *
 * Only the password page is exempt, or the redirect would target itself and
 * render nothing. The rest of `/account` is a profile the member has no reason
 * to read first (#125).
 *
 * Logout lives in the layout chrome rather than on a route, so it stays
 * reachable and nobody is trapped. Layout.test.tsx holds that.
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
