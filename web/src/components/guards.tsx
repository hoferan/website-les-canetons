import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { Capability } from "../session/capabilities";
import { useSession } from "../session/SessionProvider";

/**
 * Route guards — UX ONLY.
 *
 * Laravel's `capability:` middleware is the sole enforcement. These decide what
 * to SHOW, so a mistake here shows a wrong button; it does not open a hole. Do
 * not let that make them sloppy: a member seeing an admin form that then 403s
 * is a bug report either way.
 *
 * An anonymous visitor is sent to the login page. A logged-in one WITHOUT the
 * capability is refused in place instead — bouncing them to a login form they
 * are already past reads as "your session expired" and invites them to log in
 * again, repeatedly, at something they will never be allowed to see.
 *
 * There is ONE guard, deliberately. RequireAuth existed alongside this and was
 * deleted on 2026-09-01 with its only call site, /sinscrire: it did nothing
 * RequireCapability does not already do for an anonymous visitor, and a guard
 * with no callers is a guard nobody keeps correct.
 */

/**
 * Where the visitor was trying to go, as a path the login route can navigate
 * back to. Router STATE, not a query parameter: it never appears in a URL, so
 * nobody can craft it, and the old page's open-redirect guard is unnecessary
 * here. `safeReturnTo` still normalises it on the way out — see lib/returnTo.
 */
function useAttemptedPath(): string {
  const location = useLocation();
  return `${location.pathname}${location.search}`;
}

export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { user, can } = useSession();
  const from = useAttemptedPath();

  if (!user) {
    return <Navigate to="/authentification_inscription" state={{ from }} replace />;
  }
  if (!can(capability)) return <p role="alert">Accès refusé.</p>;

  return <>{children}</>;
}
