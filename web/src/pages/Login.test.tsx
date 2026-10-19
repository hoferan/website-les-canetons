import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useLocation } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Login } from "./Login";

/** Where the screen navigated to. There is no route table in these renders. */
function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

async function fillAndSubmit(username: string, password: string) {
  await userEvent.type(screen.getByLabelText("Identifiant"), username);
  await userEvent.type(screen.getByLabelText("Mot de passe"), password);
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
}

test("labels both fields, so a password manager can fill them", async () => {
  await renderWithSession(<Login />, { route: "/login" });

  // A field a screen reader can name is one a password manager can recognise,
  // and autoComplete tells it which one this is.
  expect(screen.getByLabelText("Identifiant")).toHaveAttribute("autocomplete", "username");
  expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("autocomplete", "current-password");
});

test("reports a wrong password in French, against the form", async () => {
  await renderWithSession(<Login />, { route: "/login" });
  await fillAndSubmit("demo.direction", "wrong");

  // findByText, not findByRole("alert"): FormError keeps its role="alert"
  // element in the tree always, so findByRole resolves at once against an
  // empty div. Waiting on the string is what actually waits.
  //
  // The token invalid_credentials, translated: never the API's English, and
  // never a raw i18next key.
  expect(
    await screen.findByText("Nom d'utilisateur ou mot de passe incorrect"),
  ).toBeInTheDocument();
});

test("keeps the username on a failure so only the wrong part is retyped", async () => {
  await renderWithSession(<Login />, { route: "/login" });
  await fillAndSubmit("demo.direction", "wrong");

  // Same reason as above: wait on the message, not on the always-present region.
  await screen.findByText("Nom d'utilisateur ou mot de passe incorrect");

  expect(screen.getByLabelText("Identifiant")).toHaveValue("demo.direction");
  expect(screen.getByLabelText("Mot de passe")).toHaveValue("");
});

test("does not submit an empty form to the API", async () => {
  let attempts = 0;
  server.use(
    http.post("/api/v1/login", () => {
      attempts++;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<Login />, { route: "/login" });
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

  // Both fields are `required` and formIsValid stops the submit, sparing the
  // commonest mistake a 400 round-trip.
  expect(attempts).toBe(0);
});

test("shows the submit as busy without disabling it", async () => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("/api/v1/login", async () => {
      await held;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<Login />, { route: "/login" });
  await fillAndSubmit("demo.direction", "demo");

  const submit = await screen.findByRole("button", { name: "Connexion…" });
  // Never the disabled attribute, which blurs the focused control to <body>
  // mid-submit. aria-disabled says the same to assistive technology while the
  // element keeps focus; the handler's early return prevents a second submit.
  expect(submit).toHaveAttribute("aria-disabled", "true");
  expect(submit).not.toBeDisabled();

  release();
});

test("a second click while the first is in flight sends nothing", async () => {
  let attempts = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("/api/v1/login", async () => {
      attempts++;
      await held;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<Login />, { route: "/login" });
  await fillAndSubmit("demo.direction", "demo");

  // aria-disabled sets pointer-events-none in CSS, which jsdom does not apply,
  // so this click lands and only the handler's early return stops it.
  await userEvent.click(await screen.findByRole("button", { name: "Connexion…" }));
  expect(attempts).toBe(1);

  release();
});

test("a member who must change their password lands on /account/password", async () => {
  // MustChangePassword enforces this anyway; going straight there saves a
  // bounce through a page they cannot use.
  server.use(
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        id: 5,
        username: "demo.young",
        firstName: "Nadia",
        lastName: "Sansconnexion",
        mustChangePassword: true,
        // The baseline role's, which every account holds: /account/password
        // asks for account.manage like the endpoint behind it.
        permissions: ["events.view", "account.manage", "attendance.respond"],
      }),
    ),
  );

  await renderWithSession(
    <>
      <Login />
      <LocationProbe />
    </>,
    { route: "/login" },
  );
  await fillAndSubmit("demo.young", "demo");

  // Exact, not a substring, so "/account" alone does not pass.
  expect(await screen.findByTestId("location")).toHaveTextContent(/^\/account\/password$/);
});

test("otherwise it returns to wherever the guard turned them away from", async () => {
  setMockUser(null);
  await renderWithSession(
    <>
      <Login />
      <LocationProbe />
    </>,
    // The route guard hands the attempted path over in router state, not in a
    // query string, so nobody can craft it. safeReturnTo normalises it anyway.
    { route: "/login", state: { from: "/members" } },
  );
  await fillAndSubmit("demo.direction", "demo");

  expect(await screen.findByTestId("location")).toHaveTextContent("/members");
});

test("an absolute URL in the router state is not honoured", async () => {
  await renderWithSession(
    <>
      <Login />
      <LocationProbe />
    </>,
    { route: "/login", state: { from: "https://evil.example" } },
  );
  await fillAndSubmit("demo.direction", "demo");

  // safeReturnTo refuses anything that is not a same-origin path, so an
  // off-site destination degrades to "/" rather than becoming an open redirect.
  expect(await screen.findByTestId("location")).toHaveTextContent("/");
  expect(screen.getByTestId("location")).not.toHaveTextContent("evil");
});

/**
 * The strings a member has to read to get in. A password manager keys off the
 * accessible name too, so a label frozen in French matters beyond looks.
 */
test("labels both fields and the submit in German", async () => {
  await renderWithSession(<Login />, { route: "/login", locale: "de-CH" });

  expect(screen.getByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
  expect(screen.getByLabelText("Benutzername")).toHaveAttribute("autocomplete", "username");
  expect(screen.getByLabelText("Passwort")).toHaveAttribute("autocomplete", "current-password");
  expect(screen.getByRole("button", { name: "Anmelden" })).toBeInTheDocument();
});

test("reports a wrong password in German, against the form", async () => {
  await renderWithSession(<Login />, { route: "/login", locale: "de-CH" });

  await userEvent.type(screen.getByLabelText("Benutzername"), "demo.direction");
  await userEvent.type(screen.getByLabelText("Passwort"), "wrong");
  await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));

  // findByText, as in the French case. useApiFormError is handed its default
  // at render time; a `t()` hoisted to module scope would freeze the French
  // here, and only this test would see it.
  expect(await screen.findByText("Benutzername oder Passwort ist falsch")).toBeInTheDocument();
});

test("shows the submit as busy in German too", async () => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("/api/v1/login", async () => {
      await held;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<Login />, { route: "/login", locale: "de-CH" });
  await userEvent.type(screen.getByLabelText("Benutzername"), "demo.direction");
  await userEvent.type(screen.getByLabelText("Passwort"), "demo");
  await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));

  // The pending label is its own string, as French has "Connexion…" beside
  // "Se connecter".
  expect(await screen.findByRole("button", { name: "Wird angemeldet…" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  release();
});
