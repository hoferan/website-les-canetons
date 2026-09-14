import { Navigate, Outlet, useLocation } from "react-router-dom";

import { ButtonLink } from "./ButtonLink";
import { PageSection } from "./PageSection";
import { useSession } from "../session/SessionProvider";

/**
 * Route guards — UX ONLY.
 *
 * Laravel's `permission:` middleware is the sole enforcement. These decide what
 * to SHOW, so a mistake here shows a wrong button; it does not open a hole. Do
 * not let that make them sloppy: a member shown an admin form that then 403s is
 * a bug report either way.
 *
 * They take a PERMISSION, never a role name. Roles merely group permissions,
 * and which role granted one is not a question any enforcement point — or any
 * mirror of one — may ask (design §3).
 */

/**
 * Where the visitor was trying to go, as a path the login route can navigate
 * back to.
 *
 * Router STATE, not a query parameter: it never appears in a URL, so nobody can
 * craft it. `safeReturnTo` normalises it on the way out anyway — see
 * lib/returnTo for why that belt-and-braces stays.
 */
function useAttemptedPath(): string {
  const location = useLocation();
  return `${location.pathname}${location.search}${location.hash}`;
}

/**
 * A route that needs a SESSION and nothing more.
 *
 * The planning is the case this exists for: reading it is something everybody
 * in the band does, not something the committee administers, so gating it on a
 * permission would be the same mistake as gating the ability to answer for an
 * event. It still sits behind login — R1c is the members' tool, and the public
 * planning is R2's (decision C1).
 *
 * REDIRECTS RATHER THAN REFUSING IN PLACE, which is the opposite of
 * RequirePermission below and is right for the opposite reason: an anonymous
 * visitor here is not being told "no", they are being told "not yet" — logging
 * in is a thing they can actually do, and `from` brings them back.
 */
export function RequireSession() {
  const { user } = useSession();
  const from = useAttemptedPath();

  if (!user) {
    return <Navigate to="/login" state={{ from }} replace />;
  }

  return <Outlet />;
}

export function RequirePermission({ permission }: { permission: string }) {
  const { user, can } = useSession();
  const from = useAttemptedPath();

  if (!user) {
    return <Navigate to="/login" state={{ from }} replace />;
  }

  // Refused IN PLACE, not redirected. Bouncing somebody past the login form
  // back to it reads as "your session expired" and invites them to log in
  // again, repeatedly, at something they will never be allowed to see.
  if (!can(permission)) {
    return <AccessDenied />;
  }

  return <Outlet />;
}

/**
 * The refusal page.
 *
 * IT USED TO BE `<p role="alert">Accès refusé.</p>` AND NOTHING ELSE — no
 * heading, so anyone navigating by heading found an empty document, and outside
 * PageSection, so at 390px the words sat flush against the left edge while
 * every other route on the site was padded.
 *
 * This is a page a legitimate, logged-in member reaches by following an
 * ordinary link, so it gets a heading, an explanation that does not blame them,
 * and a way out — the same shape as NotFound, the site's other dead end.
 *
 * `role="alert"` stays on the explanation so the refusal is ANNOUNCED: the
 * route changed without a navigation, and a screen-reader user who hears
 * nothing has no idea why the page they asked for is not there.
 */
function AccessDenied() {
  return (
    <PageSection width="text" className="py-16 text-center">
      <h1 className="font-display text-3xl">Accès refusé</h1>
      <p role="alert" className="mt-related text-gray-600">
        Cette page est réservée à d’autres membres. Si vous pensez qu’il s’agit d’une erreur,
        contactez le comité.
      </p>
      <ButtonLink to="/" variant="outline" className="mt-block">
        Retour à l’accueil
      </ButtonLink>
    </PageSection>
  );
}
