import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { getAuthMeQueryKey, useAuthLogin } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { t } from "../i18n";
import { safeReturnTo } from "../lib/returnTo";

/**
 * The one way in.
 *
 * Where it goes afterwards, in order:
 *
 *   1. `/account/password`, when the account must change its password (a
 *      committee-issued password was read out down a phone, so it is not a
 *      secret). MustChangePassword enforces this anyway; going straight there
 *      saves a bounce.
 *   2. Wherever they were trying to go, handed over in router state by the
 *      route guard and normalised by safeReturnTo.
 *   3. `/` otherwise.
 *
 * The session is invalidated rather than written: the login response carries
 * no identity (see AuthController::login), and GET /api/v1/me is the single
 * shape describing who you are.
 *
 * No "forgot password" link: `members` has no email column, and every
 * password is committee-issued (ADR 0016).
 */
export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthLogin();
  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("auth.loginFailed"));

  const attempted = safeReturnTo((location.state as { from?: unknown } | null)?.from);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // The button is aria-disabled, not disabled, so this return prevents a
    // double submit. See components/ui/button.tsx.
    if (login.isPending) {
      return;
    }

    clear();
    if (!formIsValid(event.currentTarget)) {
      return;
    }

    try {
      await login.mutateAsync({ data: { username, password } });
    } catch (thrown) {
      setFromThrown(thrown);
      // The username stays; only the password is cleared, so the commonest
      // mistake costs one field rather than two.
      setPassword("");
      return;
    }

    // Awaited before navigating: the destination is chosen from the new
    // session, and a guard rendering against a stale one would bounce the
    // member straight back here.
    await queryClient.invalidateQueries({ queryKey: getAuthMeQueryKey() });
    const me = queryClient.getQueryData<{ data?: { mustChangePassword?: boolean } }>(
      getAuthMeQueryKey(),
    );

    navigate(me?.data?.mustChangePassword ? "/account/password" : attempted, { replace: true });
  }

  return (
    <>
      <PageHero title={t("nav.login")} seed={29} width="form" />

      <PageSection width="form">
        {/* The fields stay plain vendored inputs; only the card around them
            and the button are raised (ADR 0029). */}
        <Card asChild className={cn(RAISED_CARD, "gap-related p-5")}>
          <form onSubmit={submit} noValidate>
            <RequiredLegend />
            <FormField
              id="username"
              label={t("auth.username")}
              value={username}
              onChange={setUsername}
              problem={messageFor("username")}
              required
              autoComplete="username"
            />

            <FormField
              id="password"
              label={t("auth.password")}
              type="password"
              value={password}
              onChange={setPassword}
              problem={messageFor("password")}
              required
              autoComplete="current-password"
            />

            <FormError error={error} />

            <Button
              type="submit"
              variant="raised-violet"
              className="h-12 px-5 text-base"
              aria-disabled={login.isPending}
            >
              {login.isPending ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
          </form>
        </Card>
      </PageSection>
    </>
  );
}
