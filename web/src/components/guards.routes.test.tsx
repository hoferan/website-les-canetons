import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { AppRoutes } from "../routes";
import { renderWithSession } from "../test/renderWithSession";

// Anonymous: bounced to the login form, carrying where they wanted to go.
test.each(["/sinscrire", "/inscriptions_utilisateurs?id=1", "/inscriptions_admin?id=1", "/admin"])(
  "%s sends an anonymous visitor to the login form",
  async (route) => {
    await renderWithSession(<AppRoutes />, { route });
    expect(await screen.findByRole("heading", { name: "Authentification" })).toBeInTheDocument();
  },
);

// Logged in but wrong capability: refused IN PLACE, never bounced. Sending
// someone already past the login form back to it reads as "your session
// expired" and invites them to log in again at something they will never be
// allowed to see.
test("a member without view_summary is refused, not redirected", async () => {
  setMockUser("demo.user");
  await renderWithSession(<AppRoutes />, { route: "/inscriptions_admin?id=1" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Accès refusé.");
  expect(screen.queryByRole("heading", { name: "Authentification" })).toBeNull();
});

// The direction intuition gets wrong: admin does NOT hold `respond`.
test("an admin is refused the response form", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<AppRoutes />, { route: "/inscriptions_utilisateurs?id=1" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Accès refusé.");
});

test("an admin reaches the summary and the hub", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<AppRoutes />, { route: "/admin" });
  expect(await screen.findByRole("heading", { name: "Administration" })).toBeInTheDocument();
});
