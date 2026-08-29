import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "./mocks/node";
import { AppRoutes } from "./routes";
import { renderWithSession } from "./test/renderWithSession";

test.each([
  ["/", "Bienvenue sur notre site"],
  ["/historique", "L’Histoire des Canetons"],
  // The accessible name preserves &nbsp; as an actual U+00A0, not a normal
  // space — verified against the rendered DOM. Do not "fix" this by removing
  // the &nbsp; from Cd.tsx; it is there for correct French typography.
  ["/cd", "2022 - Les Canetons ont 20 ans !!!"],
  ["/sponsors", "Sponsors et Liens Amis"],
  ["/multimedia", "France 3 Alsace / Carnaval de Colmar 2016"],
  ["/canetons", "Nos Canetons"],
  ["/moniteurs", "Nos Moniteurs"],
  // The real page, not a placeholder — hence the fuller heading.
  ["/planning_repet", "Planning des prestations et des répétitions"],
  ["/comite_teamdirection", "Le comité"],
  ["/commencement", "Tu veux commencer la guggen ?"],
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
