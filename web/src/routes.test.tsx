import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "./mocks/node";
import { AppRoutes } from "./routes";
import { renderWithSession } from "./test/renderWithSession";

test.each([
  ["/", "Accueil"],
  ["/historique", "Historique"],
  ["/canetons", "Les canetons"],
  ["/planning_repet", "Planning et répétitions"],
  ["/comite_teamdirection", "Contact Canetons"],
  ["/inscriptions_admin", "Inscriptions (admin)"],
])("%s renders its page", async (route, heading) => {
  await renderWithSession(<AppRoutes />, { route });
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
});

test("an unknown URL renders the 404 view rather than nothing", async () => {
  await renderWithSession(<AppRoutes />, { route: "/pas-une-page" });
  expect(await screen.findByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
});

// The souper routes are feature-gated, and "off" must mean ABSENT, not empty:
// a disabled route has to be indistinguishable from one that never existed,
// which is what stops a server with the feature off advertising an unannounced
// event through a stray URL.
test("the souper routes 404 while the feature is off", async () => {
  await renderWithSession(<AppRoutes />, { route: "/signup" });
  expect(await screen.findByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
});

test("the souper routes exist when the feature is on", async () => {
  server.use(
    http.get("/api/config", () =>
      HttpResponse.json({ env: "dev", features: { souper_signup: true }, occasion: null }),
    ),
  );

  await renderWithSession(<AppRoutes />, { route: "/signup" });
  expect(await screen.findByRole("heading", { name: "S’inscrire au souper" })).toBeInTheDocument();
});
