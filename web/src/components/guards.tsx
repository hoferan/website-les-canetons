import { Navigate, Outlet, useLocation } from "react-router-dom";

import { ButtonLink } from "./ButtonLink";
import { PageSection } from "./PageSection";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";

/**
 * Route guards, for UX only.
 *
 * Laravel's `permission:` middleware is the sole enforcement. These decide what
 * to show, so a mistake here shows a wrong screen rather than opening a hole.
 *
 * They take a permission, never a role name (ADR 0014).
 */

/**
 * Where the visitor was trying to go, as a path the login route can navigate
 * back to.
 *
 * Router state, not a query parameter, so it never appears in a URL and nobody
 * can craft it. `safeReturnTo` normalises it anyway; see lib/returnTo.
 */
function useAttemptedPath(): string {
  const location = useLocation();
  return `${location.pathname}${location.search}${location.hash}`;
}

/**
 * A route that needs a permission, which is every route behind login.
 *
 * There is no session-only guard. The planning and one's own account ask for
 * `events.view` and `account.manage`, the permissions their endpoints check,
 * and the baseline role grants both to every account.
 *
 * A list means any one of them: the inbox gathers sources gated on different
 * permissions, and holding any of them gives it something to show.
 */
export function RequirePermission({ permission }: { permission: string | readonly string[] }) {
  const { user, can } = useSession();
  const from = useAttemptedPath();

  // An anonymous visitor is redirected: logging in is something they can do,
  // and `from` brings them back.
  if (!user) {
    return <Navigate to="/login" state={{ from }} replace />;
  }

  // A member is refused in place. Sending them to the login form would read
  // as "your session expired" and invite them to log in again, repeatedly.
  if (!(typeof permission === "string" ? [permission] : permission).some((one) => can(one))) {
    return <AccessDenied />;
  }

  return <Outlet />;
}

/**
 * The refusal page.
 *
 * A logged-in member can reach this by following an ordinary link, so it is a
 * real page inside PageSection: a heading, an explanation that does not blame
 * them, and a way out, the same shape as NotFound.
 *
 * `role="alert"` makes the refusal announced: the route changed without a
 * navigation, and a screen-reader user who hears nothing cannot tell why the
 * page they asked for is not there.
 */
function AccessDenied() {
  return (
    <PageSection width="text" className="py-16 text-center">
      <h1 className="font-display text-3xl">{t("guards.deniedHeading")}</h1>
      <p role="alert" className="mt-related text-gray-600">
        {t("guards.deniedBody")}
      </p>
      <ButtonLink to="/" variant="raised-light" className="mt-block">
        {t("common.backHome")}
      </ButtonLink>
    </PageSection>
  );
}
