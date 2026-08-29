import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { getAuthUserQueryKey, useAuthLogin } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormField } from "../components/FormField";
import { safeReturnTo } from "../lib/returnTo";
import { useSession } from "../session/SessionProvider";

/**
 * One route, two states.
 *
 * The old site had no logged-in state for this URL: logout was a button on
 * /admin. Until that page is ported this is the only way to end a session in
 * the SPA, which is why the two live together rather than the route redirecting
 * an authenticated visitor away.
 */
export function Login() {
  const { user } = useSession();
  return user ? <LoggedIn username={user.username} /> : <LoginForm />;
}

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "La connexion a échoué. Veuillez réessayer.",
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  // Router state first — that is how the guards hand over. The query parameter
  // is the old site's mechanism, still honoured because links carrying one are
  // in the wild. Both go through safeReturnTo; only the second can be hostile.
  const destination = safeReturnTo(
    (location.state as { from?: unknown } | null)?.from ?? params.get("returnTo"),
  );

  const login = useAuthLogin({
    mutation: {
      onSuccess: async () => {
        clear();
        // THE load-bearing line. SessionProvider holds GET /api/user at
        // staleTime: Infinity, so invalidating this key is the only thing that
        // makes the new session visible. The old page reloaded the document
        // instead; a SPA that did the same would throw away the router and the
        // whole Query cache to learn one fact.
        //
        // getConfigQueryKey() is deliberately NOT invalidated: ConfigController
        // never touches Auth, so /api/config does not vary by user.
        //
        // Awaited, so the navigation lands on a page that already knows who is
        // logged in rather than one that renders anonymous and then corrects
        // itself.
        await queryClient.invalidateQueries({ queryKey: getAuthUserQueryKey() });
        navigate(destination, { replace: true });
      },
      onError: setFromThrown,
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    clear();
    login.mutate({ data: { username, password } });
  };

  return (
    <section className="mx-auto max-w-md px-4 py-8">
      <h2 className="text-2xl font-bold">Authentification</h2>

      {/* Inline, not the old alert(). A modal browser dialog is unstyled,
          dismissible only by acknowledgement, and on mobile reads as a warning
          about the browser rather than about the form. */}
      {error ? (
        <p role="alert" className="mt-4 text-canetons-red">
          {error.message}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-4 space-y-3">
        <FormField
          id="login-username"
          label="Identifiant :"
          required
          autoComplete="username"
          value={username}
          onChange={setUsername}
          problem={messageFor("username")}
        />
        <FormField
          id="login-password"
          label="Mot de passe :"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          problem={messageFor("password")}
        />
        <button type="submit" disabled={login.isPending} className="rounded border px-3 py-1">
          Se connecter
        </button>
      </form>
    </section>
  );
}

// Replaced in the next task with the real logout control.
function LoggedIn({ username }: { username: string }) {
  return (
    <section className="mx-auto max-w-md px-4 py-8">
      <h2 className="text-2xl font-bold">Authentification</h2>
      <p className="mt-4">
        Connecté en tant que <strong>{username}</strong>
      </p>
    </section>
  );
}
