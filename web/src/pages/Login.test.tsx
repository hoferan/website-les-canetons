import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Login } from "./Login";

/**
 * The login route plus a couple of destinations, so a test can assert on where
 * a successful login LANDED rather than on the fact that a request was made.
 * Navigating is half the behaviour.
 */
const app = (
  <Routes>
    <Route path="/authentification_inscription" element={<Login />} />
    <Route path="/" element={<p>Accueil</p>} />
    <Route path="/planning_repet" element={<p>Planning</p>} />
  </Routes>
);

const signIn = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.type(await screen.findByLabelText("Identifiant :"), name);
  await user.type(screen.getByLabelText("Mot de passe :"), "demo");
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
};

test("an anonymous visitor gets the old form", async () => {
  await renderWithSession(app, { route: "/authentification_inscription" });
  expect(await screen.findByRole("heading", { name: "Authentification" })).toBeInTheDocument();
  expect(screen.getByLabelText("Identifiant :")).toBeRequired();
  expect(screen.getByLabelText("Mot de passe :")).toBeRequired();
  expect(screen.getByLabelText("Mot de passe :")).toHaveAttribute("type", "password");
});

test("a successful login lands on the home page", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, { route: "/authentification_inscription" });
  await signIn(user, "demo.admin");
  expect(await screen.findByText("Accueil")).toBeInTheDocument();
});

// The session is cached at staleTime: Infinity, so nothing shows the new user
// unless the login invalidates it. Without that the app stays anonymous until
// the next full page load — which the old site's window.location.href hid.
test("the session is visible afterwards, with no reload", async () => {
  const user = userEvent.setup();
  await renderWithSession(
    <Routes>
      <Route path="/authentification_inscription" element={<Login />} />
      <Route path="/" element={<Login />} />
    </Routes>,
    { route: "/authentification_inscription" },
  );
  await signIn(user, "demo.admin");
  expect(await screen.findByText(/Connecté en tant que/)).toHaveTextContent("demo.admin");
});

test("a bad password shows the French message and does NOT navigate", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, { route: "/authentification_inscription" });
  await user.type(await screen.findByLabelText("Identifiant :"), "demo.admin");
  await user.type(screen.getByLabelText("Mot de passe :"), "wrong");
  await user.click(screen.getByRole("button", { name: "Se connecter" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nom d'utilisateur ou mot de passe incorrect",
    ),
  );
  expect(screen.queryByText("Accueil")).toBeNull();
  expect(screen.getByLabelText("Identifiant :")).toBeInTheDocument();
  // Re-enabled by the mutation settling: a slow or refused login must never
  // leave a legitimate retry permanently blocked.
  expect(screen.getByRole("button", { name: "Se connecter" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
});

// The 401 path carries no fields — per-field auth errors would enable
// username enumeration. But AuthController validates the request first, and
// that path does, so the wiring has to be pinned or a typo in the field name
// renders nothing and passes every other test.
test("a field error from the API lands on the offending input", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/login", () =>
      HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: [{ field: "password", reason: "required" }],
        },
        { status: 400 },
      ),
    ),
  );

  await renderWithSession(app, { route: "/authentification_inscription" });
  await signIn(user, "demo.admin");

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Le formulaire contient des erreurs."),
  );
  expect(screen.getByText("Mot de passe est requis")).toBeInTheDocument();
  expect(screen.getByLabelText("Mot de passe :")).toHaveAttribute("aria-invalid", "true");
});

test("the submit button is marked unavailable while the request is in flight", async () => {
  const user = userEvent.setup();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("/api/login", async () => {
      await held;
      return HttpResponse.json({ role: "admin" });
    }),
  );

  await renderWithSession(app, { route: "/authentification_inscription" });
  await signIn(user, "demo.admin");
  const submit = screen.getByRole("button", { name: "Se connecter" });
  await waitFor(() => expect(submit).toHaveAttribute("aria-disabled", "true"));
  release();
});

test("an authenticated visitor gets the logout view, not the form", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(app, { route: "/authentification_inscription" });
  expect(await screen.findByText(/Connecté en tant que/)).toHaveTextContent("demo.moderator");
  expect(screen.queryByLabelText("Identifiant :")).toBeNull();
});

test("logging out clears the session and returns to the home page", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/authentification_inscription" });
  await user.click(await screen.findByRole("button", { name: "Se déconnecter" }));
  expect(await screen.findByText("Accueil")).toBeInTheDocument();
});

test("a returnTo in router state is honoured", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, {
    route: "/authentification_inscription",
    state: { from: "/planning_repet" },
  });
  await signIn(user, "demo.admin");
  expect(await screen.findByText("Planning")).toBeInTheDocument();
});

test("a legacy ?returnTo= query is honoured", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, {
    route: "/authentification_inscription?returnTo=%2Fplanning_repet",
  });
  await signIn(user, "demo.admin");
  expect(await screen.findByText("Planning")).toBeInTheDocument();
});

// The whole point of safeReturnTo, asserted through the page rather than only
// as a unit: a hostile destination must land on the home page.
test("a hostile returnTo falls back to the home page", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, {
    route: "/authentification_inscription",
    state: { from: "//evil.com" },
  });
  await signIn(user, "demo.admin");
  expect(await screen.findByText("Accueil")).toBeInTheDocument();
});
