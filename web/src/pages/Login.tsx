import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { getAuthUserQueryKey, useAuthLogin, useAuthLogout } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";
import { safeReturnTo } from "../lib/returnTo";
import { useSession } from "../session/SessionProvider";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";

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
  return (
    <PageSection width="form">
      <h1 className="font-display text-3xl">Authentification</h1>
      {user ? <LoggedIn username={user.username} /> : <LoginForm />}
    </PageSection>
  );
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
      // Only the session key is invalidated here. Everything else is
      // staleTime: 0 (see main.tsx) and refetches on mount, so a page cached
      // while anonymous corrects itself on the next render rather than needing
      // an invalidation here. getConfigQueryKey() specifically: ConfigController
      // never touches Auth, so /api/config does not vary by user.
      //
      // `onSuccess` is awaited INSIDE the mutation's try block, so anything
      // that throws in here turns a successful login into the failure UI while
      // the user is actually logged in. Keep it to calls that cannot reject.
      onSuccess: async () => {
        // THE load-bearing line. SessionProvider holds GET /api/user at
        // staleTime: Infinity, so invalidating this key is the only thing that
        // makes the new session visible. The old page reloaded the document
        // instead; a SPA that did the same would throw away the router and the
        // whole Query cache to learn one fact.
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
    // Explicit, not implied by the button: aria-disabled leaves the control
    // clickable, and Enter in a field submits through the default button
    // regardless. This early return is the only thing preventing a double login.
    if (login.isPending) return;
    clear();
    login.mutate({ data: { username, password } });
  };

  return (
    <>
      {/* Inline, not the old alert(). A modal browser dialog is unstyled,
          dismissible only by acknowledgement, and on mobile reads as a warning
          about the browser rather than about the form. */}
      <FormError error={error} />

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
        {/* aria-disabled, not disabled: disabling the focused button blurs it
            to <body> and nothing restores focus, so a refused login could leave
            a keyboard user with no feedback and no place in the document. The
            early return in `submit` is the real guard. */}
        <Button type="submit" aria-disabled={login.isPending}>
          Se connecter
        </Button>
      </form>
    </>
  );
}

/**
 * The account view: who you are, and the only way to stop being them.
 *
 * The old site's logout lived on /admin, which is not ported yet — and even
 * once it is, a member who is not an admin never sees that page, so this stays.
 */
function LoggedIn({ username }: { username: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { error, setFromThrown } = useApiFormError("La déconnexion a échoué. Veuillez réessayer.");

  const logout = useAuthLogout({
    mutation: {
      onSuccess: async () => {
        // Same reason as the login side: the session query is cached forever,
        // so it has to be invalidated or the app keeps showing the old user.
        // The refetch answers 401, which SessionProvider reads as "anonymous"
        // — that is a normal answer there, not a failure.
        await queryClient.invalidateQueries({ queryKey: getAuthUserQueryKey() });
        navigate("/", { replace: true });
      },
      onError: setFromThrown,
    },
  });

  // No <section> or <h2> here: Task 5 hoisted the route's wrapper and heading
  // into `Login`, so both branches render only their own body. Putting them
  // back would duplicate chrome that has to be edited in lockstep forever.
  return (
    <>
      <p className="mt-4">
        Connecté en tant que <strong>{username}</strong>
      </p>

      <FormError error={error} />

      {/* aria-disabled keeps the button focusable, so the early return is the
          only thing stopping a second click — see the login side.
          `logout.mutate()` takes no argument: the generated hook types its
          variables as `void`. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (logout.isPending) return;
          logout.mutate();
        }}
        aria-disabled={logout.isPending}
        className="mt-4"
      >
        Se déconnecter
      </Button>
    </>
  );
}
