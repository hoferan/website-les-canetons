import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { getAuthMeQueryKey, useAuthLogin } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { safeReturnTo } from "../lib/returnTo";

/**
 * The one way in.
 *
 * WHERE IT GOES AFTERWARDS, in order:
 *
 *   1. `/account`, when the account must change its password. A
 *      committee-issued password was read out loud down a phone, so it is not a
 *      secret. MustChangePassword enforces this globally; sending them straight
 *      there just avoids a pointless bounce through a page they cannot use.
 *   2. Wherever they were trying to go, handed over in router STATE by the
 *      route guard and normalised by safeReturnTo.
 *   3. `/` otherwise.
 *
 * The session is INVALIDATED rather than written. GET /api/me is the single
 * shape describing who you are, so the login response deliberately carries no
 * identity (see AuthController::login) — this refetches it instead of guessing
 * from a body that does not have it.
 *
 * NO "FORGOT PASSWORD" LINK. There is no address to send one to: `members` has
 * no email column, and every password is committee-issued (§4.4). A link that
 * opened a dead end would be worse than its absence.
 */
export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthLogin();
  const { error, setFromThrown, clear, messageFor } = useApiFormError("La connexion a échoué.");

  const attempted = safeReturnTo((location.state as { from?: unknown } | null)?.from);

  async function submit(event: FormEvent) {
    event.preventDefault();

    // aria-disabled, not disabled — so THIS early return is what actually
    // prevents a double submit. See components/ui/button.tsx.
    if (login.isPending) {
      return;
    }

    clear();

    try {
      await login.mutateAsync({ data: { username, password } });
    } catch (thrown) {
      setFromThrown(thrown);
      // The username stays; only the password is cleared, so the commonest
      // mistake costs one field rather than two.
      setPassword("");
      return;
    }

    // Awaited before navigating: the destination is chosen from the NEW
    // session, and a route guard rendering against a stale one would bounce
    // the member straight back here.
    await queryClient.invalidateQueries({ queryKey: getAuthMeQueryKey() });
    const me = queryClient.getQueryData<{ data?: { mustChangePassword?: boolean } }>(
      getAuthMeQueryKey(),
    );

    navigate(me?.data?.mustChangePassword ? "/account" : attempted, { replace: true });
  }

  return (
    <PageSection width="form">
      <h1 className="font-display text-4xl">Connexion</h1>

      <form onSubmit={submit} className="mt-block flex flex-col gap-related">
        <FormField
          id="username"
          label="Identifiant"
          value={username}
          onChange={setUsername}
          problem={messageFor("username")}
          required
          autoComplete="username"
        />

        <FormField
          id="password"
          label="Mot de passe"
          type="password"
          value={password}
          onChange={setPassword}
          problem={messageFor("password")}
          required
          autoComplete="current-password"
        />

        <FormError error={error} />

        <Button type="submit" aria-disabled={login.isPending}>
          {login.isPending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </PageSection>
  );
}
