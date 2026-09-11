import { createContext, use, type ReactNode } from "react";

import { useAuthMe, useConfigShow } from "../api/generated/endpoints";
import type { AuthMe200, ConfigShow200 } from "../api/generated/model";
import { ApiError } from "../api/http";

type Session = {
  config: ConfigShow200;
  user: AuthMe200 | null;
  /**
   * UX ONLY. Laravel's `permission:` middleware is the sole enforcement — a
   * mistake here shows a wrong button, it does not open a hole. That is not a
   * licence to be sloppy: a member shown an admin form that then 403s is a bug
   * report either way.
   *
   * It takes the permission STRING the API sends, never a role name. Roles
   * merely group permissions, and nothing in the UI may branch on WHICH role
   * granted one (design §3) — the same rule the middleware follows, which is
   * what keeps "why can she do this?" answerable in one place.
   */
  can: (permission: string) => boolean;
};

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) {
    throw new Error("useSession was called outside SessionProvider — the boot gate did not run.");
  }
  return session;
}

/**
 * The boot gate.
 *
 * Nothing below renders until GET /api/config has resolved. That is deliberate,
 * not a loading-state convenience: the env ribbon and the feature flags come
 * from it, so rendering first would flash the wrong chrome — on PROD, a
 * non-prod ribbon, which is exactly the thing the ribbon exists to prevent
 * anyone believing.
 *
 * A 401 from GET /api/me is a NORMAL answer meaning "anonymous", not a
 * failure. `retry: false` keeps Query from retrying it three times before
 * settling, which would delay the first paint for every logged-out visitor —
 * i.e. almost all of them.
 *
 * Both queries are staleTime: Infinity. Neither changes without a navigation
 * that reloads the app (login and logout both invalidate explicitly), and
 * refetching config on every window focus would put a request behind every
 * tab switch for no benefit.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const config = useConfigShow({ query: { retry: false, staleTime: Infinity } });
  const user = useAuthMe({ query: { retry: false, staleTime: Infinity } });

  if (config.isPending || user.isPending) {
    return null;
  }

  if (config.isError) {
    return (
      <p role="alert">Le site n’a pas pu démarrer. Veuillez réessayer dans quelques instants.</p>
    );
  }

  // A 401 is the anonymous case. Anything else from /me is worth knowing
  // about, but must not block the site: the public pages do not need a session.
  if (user.isError && !(user.error instanceof ApiError && user.error.status === 401)) {
    console.error("Unexpected failure reading the session:", user.error);
  }

  // Narrowed on status, not on isError alone. orval types this response as a
  // discriminated union of every declared response — authMeResponse200 |
  // authMeResponse401 — so `.data` is `AuthMe200 | AuthenticationException`
  // until `status` picks a branch. In practice the mutator throws on 401 so the
  // error branch never arrives as a resolved value, but the type is honest that
  // it could, and narrowing costs one comparison.
  const currentUser = !user.isError && user.data.status === 200 ? user.data.data : null;

  const value: Session = {
    // The double .data is not a typo: the outer one is TanStack Query's, the
    // inner one is orval's { data, status, headers } envelope. See http.ts.
    config: config.data.data,
    user: currentUser,
    // An anonymous visitor holds nothing, so this answers false rather than
    // throwing: every caller is a render deciding whether to draw a control,
    // and the logged-out case is the common one on the public pages.
    can: (permission) => currentUser?.permissions.includes(permission) ?? false,
  };

  return <SessionContext value={value}>{children}</SessionContext>;
}
