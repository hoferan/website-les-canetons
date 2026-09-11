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

  // getByLabelText, not a placeholder or a testid: a field a screen reader can
  // name is the same field a password manager can recognise, and autoComplete
  // is what tells it which one this is.
  expect(screen.getByLabelText("Identifiant")).toHaveAttribute("autocomplete", "username");
  expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("autocomplete", "current-password");
});

test("reports a wrong password in French, against the form", async () => {
  await renderWithSession(<Login />, { route: "/login" });
  await fillAndSubmit("demo.direction", "wrong");

  // findByTEXT, not findByRole("alert"). FormError keeps its role="alert"
  // element in the tree ALWAYS — deliberately, so the region is announced
  // reliably — which means findByRole resolves immediately against an empty
  // div and the content assertion races the mutation. Waiting on the string is
  // the only form that actually waits.
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

  // Both fields are `required`, so the browser stops it. Asserted because the
  // alternative — a 400 round-trip to be told a field is required — is a worse
  // experience for the commonest mistake there is.
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
  // NEVER the disabled attribute: disabling the focused control blurs it to
  // <body> and throws focus away mid-submit. aria-disabled says the same thing
  // to assistive technology while the element keeps focus, and an early return
  // in the handler is what actually prevents the second submit.
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

  // aria-disabled sets pointer-events-none in CSS, and jsdom applies no CSS —
  // so this click lands, which is the point: the ONLY thing preventing the
  // second request is the early return in the handler. Remove it and this
  // test is what says so.
  await userEvent.click(await screen.findByRole("button", { name: "Connexion…" }));
  expect(attempts).toBe(1);

  release();
});

test("a member who must change their password lands on /account", async () => {
  // A committee-issued password was read out loud down a phone, so it is not a
  // secret. MustChangePassword enforces this globally; going straight there
  // avoids a pointless bounce through a page they cannot use.
  server.use(
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        id: 5,
        username: "demo.young",
        firstName: "Nadia",
        lastName: "Sansconnexion",
        isPlayer: true,
        mustChangePassword: true,
        permissions: [],
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

  expect(await screen.findByTestId("location")).toHaveTextContent("/account");
});

test("otherwise it returns to wherever the guard turned them away from", async () => {
  setMockUser(null);
  await renderWithSession(
    <>
      <Login />
      <LocationProbe />
    </>,
    // The route guard hands the attempted path over in router STATE, not in a
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
