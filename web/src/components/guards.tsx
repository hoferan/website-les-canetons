import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

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
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  if (!user) return <Navigate to="/authentification_inscription" replace />;
  return <>{children}</>;
}

export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { user, can } = useSession();

  if (!user) return <Navigate to="/authentification_inscription" replace />;
  if (!can(capability)) return <p role="alert">Accès refusé.</p>;

  return <>{children}</>;
}
