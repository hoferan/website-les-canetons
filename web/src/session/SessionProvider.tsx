import { createContext, use, type ReactNode } from "react";

import { useAuthUser, useConfig } from "../api/generated/endpoints";
import type { AuthUser200, Config200 } from "../api/generated/model";
import { ApiError } from "../api/http";

type Session = {
  config: Config200;
  user: AuthUser200 | null;
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
 * A 401 from GET /api/user is a NORMAL answer meaning "anonymous", not a
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
  const config = useConfig({ query: { retry: false, staleTime: Infinity } });
  const user = useAuthUser({ query: { retry: false, staleTime: Infinity } });

  if (config.isPending || user.isPending) {
    return null;
  }

  if (config.isError) {
    return (
      <p role="alert">Le site n’a pas pu démarrer. Veuillez réessayer dans quelques instants.</p>
    );
  }

  // A 401 is the anonymous case. Anything else from /user is worth knowing
  // about, but must not block the site: the public pages do not need a session.
  if (user.isError && !(user.error instanceof ApiError && user.error.status === 401)) {
    console.error("Unexpected failure reading the session:", user.error);
  }

  // Narrowed on status, not on isError alone. orval types this response as a
  // discriminated union of every declared response — authUserResponse200 |
  // authUserResponse401 — so `.data` is `AuthUser200 | AuthenticationException`
  // until `status` picks a branch. In practice the mutator throws on 401 so the
  // error branch never arrives as a resolved value, but the type is honest that
  // it could, and narrowing costs one comparison.
  const currentUser = !user.isError && user.data.status === 200 ? user.data.data : null;

  const value: Session = {
    // The double .data is not a typo: the outer one is TanStack Query's, the
    // inner one is orval's { data, status, headers } envelope. See http.ts.
    config: config.data.data,
    user: currentUser,
  };

  return <SessionContext value={value}>{children}</SessionContext>;
}
