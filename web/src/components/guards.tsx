import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { ButtonLink } from "@/components/ButtonLink";
import { PageSection } from "@/components/PageSection";

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
  if (!can(capability)) return <AccessDenied />;

  return <>{children}</>;
}

/**
 * The refusal page.
 *
 * IT USED TO BE `<p role="alert">Accès refusé.</p>` AND NOTHING ELSE — no
 * heading, and outside PageSection, so at 390px the words sat flush against the
 * left edge with no gutter while every other route on the site was padded, and
 * anyone navigating by heading found an empty document. Four assertions in
 * guards.test.tsx passed over it the whole time, because they only ever checked
 * that the string was somewhere in the DOM.
 *
 * This is a page a legitimate, logged-in member reaches by following an ordinary
 * link: the capability matrix is NOT a hierarchy, so an `admin` lands here on
 * /inscriptions_utilisateurs. So it gets a heading, an explanation that does not
 * blame them, and a way out — the same shape as NotFound, which is the site's
 * other dead end.
 *
 * `role="alert"` stays on the explanation so the refusal is ANNOUNCED: the route
 * changed without a navigation, and a screen-reader user who hears nothing has
 * no idea why the page they asked for is not there.
 */
function AccessDenied() {
  return (
    <PageSection width="text" className="py-16 text-center">
      <h1 className="font-display text-3xl">Accès refusé</h1>
      <p role="alert" className="mt-related text-gray-600">
        Votre compte n’a pas accès à cette page.
      </p>
      <ButtonLink to="/" variant="outline" className="mt-block">
        Retour à l’accueil
      </ButtonLink>
    </PageSection>
  );
}
