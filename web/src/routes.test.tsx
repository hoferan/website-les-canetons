import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "./mocks/handlers";
import { AppRoutes } from "./routes";
import { renderWithSession } from "./test/renderWithSession";

/**
 * The route table after R1b: /login, /account and /members, plus the 404
 * fallback. The public pages and the events domain are still absent and each
 * waits on its own release — see routes.tsx.
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

test("renders the roster at /members for somebody who may administer it", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/members" });
  expect(await screen.findByRole("heading", { name: "Membres" })).toBeInTheDocument();
});

test("refuses /members in place for a member who may not", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/members" });
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
});

test("sends an anonymous visitor from /members to the login page", async () => {
  await renderWithSession(<AppRoutes />, { route: "/members" });
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
});

test("holds a member with a committee-issued password on /account", async () => {
  setMockUser("demo.mustchange");
  await renderWithSession(<AppRoutes />, { route: "/members" });
  expect(await screen.findByRole("heading", { name: "Mon compte" })).toBeInTheDocument();
});

// The catch-all must survive the new nesting. Apache serves the SPA shell for
// every unknown path by design, so this view IS the site's 404.
test("still answers an unknown path with the 404 view", async () => {
  await renderWithSession(<AppRoutes />, { route: "/rien-du-tout" });
  expect(await screen.findByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
});

test("renders the planning at /events for any logged-in member", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/events" });
  expect(await screen.findByRole("heading", { name: "Planning" })).toBeInTheDocument();
});

test("sends an anonymous visitor from /events to the login page", async () => {
  // RequireSession REDIRECTS rather than refusing in place: logging in is a
  // thing this visitor can actually do, unlike the permission case.
  await renderWithSession(<AppRoutes />, { route: "/events" });
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
});
