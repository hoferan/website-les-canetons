import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Accueil } from "./Accueil";

// The split is on the CAPABILITY, not on being logged in. `user` and
// `moderator` may respond to events but hold no view_summary, so they see the
// same public half an anonymous visitor sees. Every intuition about roles says
// otherwise, which is exactly why this is pinned.
test("an anonymous visitor is invited to reserve", async () => {
  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("link", { name: "S’inscrire au souper" })).toHaveAttribute(
    "href",
    "/signup",
  );
  expect(screen.getByText(/Amis et familles, réservez votre place/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Voir les inscriptions" })).not.toBeInTheDocument();
});

test("a member without view_summary sees the same invitation", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("link", { name: "S’inscrire au souper" })).toBeInTheDocument();
});

test("an admin is sent to the summary instead", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("link", { name: "Voir les inscriptions" })).toHaveAttribute(
    "href",
    "/signups_admin",
  );
  expect(screen.queryByRole("link", { name: "S’inscrire au souper" })).not.toBeInTheDocument();
});

// With the feature off, a server publishes no copy about an unannounced event.
// The card must not appear at all — not an empty one.
test("with the feature off there is no card", async () => {
  server.use(
    http.get("/api/config", () =>
      HttpResponse.json({ env: "dev", features: { souper_signup: false }, occasion: null }),
    ),
  );

  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("heading", { name: "Bienvenue sur notre site" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "S’inscrire au souper" })).not.toBeInTheDocument();
  expect(screen.queryByText(/25 ans des Canetons/)).not.toBeInTheDocument();
});
