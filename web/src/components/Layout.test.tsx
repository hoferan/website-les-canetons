import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { AppRoutes } from "../routes";
import { renderWithSession } from "../test/renderWithSession";
import { EnvRibbon } from "./EnvRibbon";

test.each([
  ["dev", true],
  ["test", true],
  ["qa", true],
  ["prod", false],
  // The last two matter most: an env nobody configured must NOT get a ribbon,
  // or the live site eventually shows one and everyone learns to ignore
  // ribbons. Asserted on the rendered output rather than by text — querying for
  // the empty string matches every node.
  ["", false],
  ["something-else", false],
])("env %s shows a ribbon: %s", (env, shown) => {
  const { container } = render(
    <MemoryRouter>
      <EnvRibbon env={env} />
    </MemoryRouter>,
  );

  expect(container.textContent).toBe(shown ? env.toUpperCase() : "");
});

test("the Galerie link is external and opens in a new tab", async () => {
  await renderWithSession(<AppRoutes />, { route: "/login" });

  const galerie = screen.getByRole("link", { name: /Galerie/ });
  expect(galerie).toHaveAttribute("href", expect.stringContaining("flickr.com"));
  expect(galerie).toHaveAttribute("target", "_blank");
  // Without rel=noreferrer a target=_blank link hands the opened page a
  // window.opener reference back into this one.
  expect(galerie).toHaveAttribute("rel", "noreferrer");
});

test("the auth link says Connexion when nobody is logged in", async () => {
  await renderWithSession(<AppRoutes />, { route: "/login" });
  const link = screen.getByRole("link", { name: "Connexion" });
  expect(link).toBeInTheDocument();
  // Pins the destination, not just the accessible name: without this, the
  // link could be repointed at any dead URL and this test would still pass.
  expect(link).toHaveAttribute("href", "/login");
});

test("the auth link shows the username once logged in", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  expect(screen.getByRole("link", { name: "demo.direction" })).toBeInTheDocument();
});

test("points a logged-in member at their own account, not back at the login form", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  expect(screen.getByRole("link", { name: "demo.direction" })).toHaveAttribute("href", "/account");
});

test("shows the Membres entry to a member who can administer members", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  expect(screen.getByRole("link", { name: "Membres" })).toHaveAttribute("href", "/members");
});

test("hides the Membres entry entirely from a member who cannot", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  // ABSENT, not refused: a link that leads to "Accès refusé" teaches people
  // that parts of the site are broken for them.
  expect(screen.queryByRole("link", { name: "Membres" })).toBeNull();
});

test("hides it from an anonymous visitor", async () => {
  await renderWithSession(<AppRoutes />, { route: "/login" });
  expect(screen.queryByRole("link", { name: "Membres" })).toBeNull();
});

test("the hamburger toggles the menu and reports its state", async () => {
  await renderWithSession(<AppRoutes />, { route: "/login" });

  const toggle = screen.getByRole("button", { name: "Menu de navigation" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("shows Événements to any logged-in member, whatever they can do", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  expect(screen.getByRole("link", { name: "Événements" })).toHaveAttribute("href", "/events");
});

test("hides Événements from an anonymous visitor", async () => {
  // R1c is the members' tool (C1). The public planning is R2's.
  await renderWithSession(<AppRoutes />, { route: "/login" });
  expect(screen.queryByRole("link", { name: "Événements" })).toBeNull();
});
