import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "./mocks/handlers";
import { AppRoutes } from "./routes";
import { renderWithSession } from "./test/renderWithSession";

/**
 * The route table: which page each URL reaches, which guard stands in front of
 * it, and the 404 fallback. See routes.tsx.
 */
test("/login renders its page", async () => {
  await renderWithSession(<AppRoutes />, { route: "/login" });
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
});

test("an unknown URL renders the 404 view rather than nothing", async () => {
  await renderWithSession(<AppRoutes />, { route: "/pas-une-page" });
  expect(await screen.findByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
});

// Legacy French paths are not redirected (ADR 0003).
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

test("holds a member with a committee-issued password on /account/password", async () => {
  setMockUser("demo.mustchange");
  await renderWithSession(<AppRoutes />, { route: "/members" });
  expect(
    await screen.findByRole("heading", { level: 1, name: "Mot de passe" }),
  ).toBeInTheDocument();
});

// The catch-all sits inside MustChangePassword. Apache serves the SPA shell
// for every unknown path, so this view is the site's 404.
test("still answers an unknown path with the 404 view", async () => {
  await renderWithSession(<AppRoutes />, { route: "/rien-du-tout" });
  expect(await screen.findByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
});

test("renders the planning at /events for a member who may read it", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/events" });
  expect(await screen.findByRole("heading", { name: "Planning" })).toBeInTheDocument();
});

test("refuses /events in place for an account without events.view", async () => {
  // Every real account holds it through the baseline role, but it is the
  // permission the API checks, and this account holds no role at all.
  setMockUser("demo.nobaseline");
  await renderWithSession(<AppRoutes />, { route: "/events" });
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
});

test("sends an anonymous visitor from /events to the login page", async () => {
  // A guard redirects an anonymous visitor rather than refusing in place,
  // because logging in is something they can do.
  await renderWithSession(<AppRoutes />, { route: "/events" });
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
});

test("renders /account for a member who may manage their own account", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/account" });
  expect(await screen.findByRole("heading", { name: "Mon compte" })).toBeInTheDocument();
});

test("refuses /account and /account/password in place without account.manage", async () => {
  setMockUser("demo.nobaseline");
  const { unmount } = await renderWithSession(<AppRoutes />, { route: "/account" });
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
  unmount();

  await renderWithSession(<AppRoutes />, { route: "/account/password" });
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
});

test("renders the role editor at /roles for somebody who may manage roles", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/roles" });
  expect(await screen.findByRole("heading", { level: 1, name: "Rôles" })).toBeInTheDocument();
});

test("refuses /roles in place to somebody who administers members but not roles", async () => {
  // demo.roster holds members.manage and nothing about roles: giving a role
  // to somebody and deciding what it grants are separate permissions.
  setMockUser("demo.roster");
  await renderWithSession(<AppRoutes />, { route: "/roles" });
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
});

test("renders the register editor at /registers for somebody who manages members", async () => {
  setMockUser("demo.roster");
  await renderWithSession(<AppRoutes />, { route: "/registers" });
  expect(await screen.findByRole("heading", { level: 1, name: "Pupitres" })).toBeInTheDocument();
});

test("refuses /registers in place to a player", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/registers" });
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
});

test("sends an anonymous visitor from /account to the login page", async () => {
  await renderWithSession(<AppRoutes />, { route: "/account" });
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
});

/**
 * The public pages, each asserted by its heading: an unregistered route
 * renders the 404 view, which is a page too, so "something appeared" would
 * pass for a URL that does not exist.
 */
test("/history renders the band's history", async () => {
  await renderWithSession(<AppRoutes />, { route: "/history" });
  expect(
    await screen.findByRole("heading", { name: /L’Histoire des Canetons/ }),
  ).toBeInTheDocument();
});

test("/join renders the joining page", async () => {
  await renderWithSession(<AppRoutes />, { route: "/join" });
  expect(
    await screen.findByRole("heading", { name: /Tu veux commencer la guggen/ }),
  ).toBeInTheDocument();
});

test("/contact renders the contact form", async () => {
  await renderWithSession(<AppRoutes />, { route: "/contact" });
  expect(await screen.findByRole("heading", { name: "Contact" })).toBeInTheDocument();
});

/**
 * The public pages sit outside MustChangePassword (routes.tsx): a member with
 * a committee-issued password is held away from the members' tool, not from a
 * page a stranger can read. Moving them inside the gate fails this test and
 * nothing else.
 */
test("does not hold a member with a committee-issued password away from the public pages", async () => {
  setMockUser("demo.mustchange");
  await renderWithSession(<AppRoutes />, { route: "/history" });
  expect(
    await screen.findByRole("heading", { name: /L’Histoire des Canetons/ }),
  ).toBeInTheDocument();
});

// Without a `/` route the site's own address would answer with the 404 view,
// and a test that only checked for a page would still pass.
test("/ renders the home page rather than the 404 view", async () => {
  await renderWithSession(<AppRoutes />, { route: "/" });
  expect(
    await screen.findByRole("heading", { name: /La guggen d’enfants de Fribourg/ }),
  ).toBeInTheDocument();
});

test("/agenda renders the public agenda", async () => {
  await renderWithSession(<AppRoutes />, { route: "/agenda" });
  expect(await screen.findByRole("heading", { name: "Où nous voir" })).toBeInTheDocument();
});

test("/band renders the band", async () => {
  await renderWithSession(<AppRoutes />, { route: "/band" });
  expect(await screen.findByRole("heading", { name: "Nos Canetons" })).toBeInTheDocument();
});

test("/committee renders the committee", async () => {
  await renderWithSession(<AppRoutes />, { route: "/committee" });
  expect(await screen.findByRole("heading", { name: "Le comité" })).toBeInTheDocument();
});
