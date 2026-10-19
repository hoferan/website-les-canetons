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
   * UX only. Laravel's `permission:` middleware is the sole enforcement, so a
   * mistake here shows a wrong button rather than opening a hole.
   *
   * It takes the permission string the API sends, never a role name: nothing
   * in the UI may branch on which role granted a permission (ADR 0014).
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
 * Nothing below renders until GET /api/config has resolved: the env ribbon and
 * the feature flags come from it, and rendering first would flash the wrong
 * ribbon.
 *
 * A 401 from GET /api/me is the normal answer for an anonymous visitor.
 * `retry: false` keeps Query from retrying it three times and delaying every
 * logged-out first paint.
 *
 * Both queries are staleTime: Infinity. Login, logout and a session expiring
 * under an open page (useForgetExpiredSession) invalidate explicitly, and a
 * refetch on every window focus would buy nothing.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const config = useConfigShow({ query: { retry: false, staleTime: Infinity } });
  const user = useAuthMe({ query: { retry: false, staleTime: Infinity } });
  useForgetExpiredSession();

  if (config.isPending || user.isPending) {
    return null;
  }

  // `status !== 200` narrows the union: orval types this as ConfigShow200 |
  // Problem503Response (the 503 of RunPendingMigrations), so
  // `config.data.data` is not a config until the status picks a branch. The
  // mutator throws on a 503, so isError covers it at runtime.
  if (config.isError || config.data.status !== 200) {
    return <p role="alert">{t("common.bootFailed")}</p>;
  }

  // A 401 is the anonymous case. Anything else from /me is worth knowing
  // about, but must not block the site: the public pages do not need a session.
  if (user.isError && !(user.error instanceof ApiError && user.error.status === 401)) {
    console.error("Unexpected failure reading the session:", user.error);
  }

  // Narrowed on status for the same reason: `.data` is
  // `AuthMe200 | AuthenticationException` until `status` picks a branch, even
  // though the mutator throws on 401.
  const currentUser = !user.isError && user.data.status === 200 ? user.data.data : null;

  const value: Session = {
    // The outer .data is TanStack Query's, the inner one orval's envelope.
    config: config.data.data,
    user: currentUser,
    // False for an anonymous visitor: every caller is a render deciding
    // whether to draw a control.
    can: (permission) => currentUser?.permissions.includes(permission) ?? false,
  };

  return <SessionContext value={value}>{children}</SessionContext>;
}

/**
 * A session that expires while a page is open.
 *
 * `/me` is cached forever, so without this the SPA goes on believing in a
 * session the server has dropped, and every write fails with no way to the
 * login form. The first call to answer 401 makes `/me` ask again; that
 * answers 401 too, the user becomes null, and RequirePermission redirects to
 * the login form with `from` set.
 *
 * Invalidated rather than cleared, so the refetch keeps the old answer until
 * the new one arrives; a removed query would stay held by the mounted observer
 * anyway (see logout.ts).
 *
 * Two kinds of 401 are left alone:
 *
 *  - any while `/me` holds no user. That covers an anonymous visitor, a burst
 *    of failing calls after the refetch has answered, and `/me`'s own 401: the
 *    cache records the error before notifying, so `/me` already holds no user
 *    and cannot refetch itself forever.
 *  - logout's. logout.ts answers it with a full page load, which a redirect
 *    here would race.
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
