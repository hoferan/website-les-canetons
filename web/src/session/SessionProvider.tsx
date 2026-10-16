import { matchMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, type ReactNode } from "react";

import {
  getAuthLogoutMutationKey,
  getAuthMeQueryKey,
  useAuthMe,
  useConfigShow,
} from "../api/generated/endpoints";
import type { AuthMe200, ConfigShow200 } from "../api/generated/model";
import { ApiError } from "../api/http";
import { t } from "../i18n";

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
   * granted one (ADR 0014) — the same rule the middleware follows, which is
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
 * that reloads the app (login and logout both invalidate explicitly, and so
 * does a session expiring under an open page; see useForgetExpiredSession), and
 * refetching config on every window focus would put a request behind every
 * tab switch for no benefit.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const config = useConfigShow({ query: { retry: false, staleTime: Infinity } });
  const user = useAuthMe({ query: { retry: false, staleTime: Infinity } });
  useForgetExpiredSession();

  if (config.isPending || user.isPending) {
    return null;
  }

  // `status !== 200` beside isError, and it is what narrows the union rather
  // than merely guarding it. orval types this as ConfigShow200 |
  // Problem503Response — the 503 every route behind RunPendingMigrations can
  // answer with, declared since 2026-09-12 — so `config.data.data` is not a
  // config until the status picks a branch. The mutator throws on a 503, so
  // isError already covers it at runtime; tsc is right that the type does not
  // say so, and the site refusing to start is the correct answer either way.
  if (config.isError || config.data.status !== 200) {
    return <p role="alert">{t("common.bootFailed")}</p>;
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

/**
 * A session that expires while a page is open (#296).
 *
 * `/me` is cached forever, so without this the SPA goes on believing in a
 * session the server has dropped: the guards keep the member on the page, and
 * every write fails with a "Non authentifié" toast and no way to the login
 * form. Whichever call is first to answer 401 makes `/me` ask again. That
 * answers 401 too, the user above becomes null, and RequirePermission redirects
 * to the login form with `from` set, which is what brings the member back.
 *
 * Invalidated rather than cleared, so the server decides: the refetch keeps the
 * old answer until the new one arrives, and a removed query would leave the
 * mounted observer holding it anyway (see logout.ts).
 *
 * Two kinds of 401 are left alone:
 *
 *  - any while `/me` does not hold a user. A visitor who was never logged in
 *    gets 401s as a matter of course, and so does the member once the refetch
 *    has answered, so a burst of failing calls asks `/me` once. This is also
 *    what stops `/me` reacting to its own 401, the normal anonymous answer,
 *    and refetching forever: the cache records the error before it tells
 *    anybody, so by the time this hears of it `/me` holds no user. A separate
 *    check for the `/me` key would never decide anything.
 *  - logout's. logout.ts expects it and answers with a full page load, and a
 *    redirect to the login form here would race that load.
 */
function useForgetExpiredSession(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const meKey = getAuthMeQueryKey();
    const logoutKey = getAuthLogoutMutationKey();

    const forget = (error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401) return;
      if (queryClient.getQueryState(meKey)?.status !== "success") return;

      // cancelRefetch off, so a burst of 401s joins the refetch already
      // running instead of restarting it once for each.
      void queryClient.invalidateQueries(
        { queryKey: meKey, exact: true },
        { cancelRefetch: false },
      );
    };

    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      forget(event.action.error);
    });

    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      if (matchMutation({ mutationKey: logoutKey }, event.mutation)) return;
      forget(event.action.error);
    });

    return () => {
      queries();
      mutations();
    };
  }, [queryClient]);
}
