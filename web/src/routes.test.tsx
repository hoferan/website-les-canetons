import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { AppRoutes } from "./routes";
import { renderWithSession } from "./test/renderWithSession";

/**
 * The route table during the R1a rebuild: almost empty on purpose (see
 * routes.tsx). Only /login and the 404 fallback exist; everything else — the
 * old domain's pages, the legacy French URLs — is gone until R1b/R1c bring
 * real screens back.
 */
test("/login renders its page", async () => {
  await renderWithSession(<AppRoutes />, { route: "/login" });
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
});

test("an unknown URL renders the 404 view rather than nothing", async () => {
  await renderWithSession(<AppRoutes />, { route: "/pas-une-page" });
  expect(await screen.findByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
});

// Legacy French paths are NOT redirected — the rebuild owes no backwards
// compatibility (design §7) — so the old login URL now falls through to 404
// like any other unknown path.
test("the legacy login URL is not redirected and falls through to 404", async () => {
  await renderWithSession(<AppRoutes />, { route: "/authentification_inscription" });
  expect(await screen.findByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
});
