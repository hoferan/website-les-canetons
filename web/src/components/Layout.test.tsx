import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { currentMockUser, setMockUser } from "../mocks/handlers";
import { AppRoutes } from "../routes";
import { renderWithSession } from "../test/renderWithSession";
import { EnvRibbon } from "./EnvRibbon";
import { Layout } from "./Layout";

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

test("the username opens the account menu once logged in", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  const trigger = screen.getByRole("button", { name: "demo.direction" });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  expect(screen.queryByRole("link", { name: "Connexion" })).toBeNull();
});

test("points a logged-in member at their own account, not back at the login form", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });

  await user.click(screen.getByRole("button", { name: "demo.direction" }));

  expect(await screen.findByRole("menuitem", { name: "Mon compte" })).toHaveAttribute(
    "href",
    "/account",
  );
});

/**
 * #99's whole point: the name and the logout used to sit side by side as nav
 * items, one stray click apart. The logout exists only inside the open menu,
 * and it is the second item, behind a separator, not the first.
 */
test("keeps the logout out of reach until the account menu is opened", async () => {
  const user = userEvent.setup();
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/events" });

  await screen.findByRole("button", { name: "demo.player" });
  expect(screen.queryByRole("button", { name: "Déconnexion" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Déconnexion" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "demo.player" }));

  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual(["Mon compte", "Déconnexion"]);
});

test("marks the account menu as the current page on /account", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/account" });
  await screen.findByRole("heading", { name: "Mon compte" });

  expect(screen.getByRole("button", { name: "demo.player" })).toHaveClass("text-violet");
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

/**
 * THE WAY OUT, which did not exist until 2026-09-14.
 *
 * `POST /api/v1/logout` shipped in R1a with Laravel tests and nothing on
 * screen ever called it, so a member's only way to end a session was to clear
 * their cookies. What hid it was MustChangePassword's docblock, which argued
 * its gate could trap nobody BECAUSE logout was a button in the chrome — an
 * invariant documented as satisfied by a control that was never written. These
 * tests are what make that sentence true.
 */
test("offers no way out to somebody who is not logged in", async () => {
  await renderWithSession(<AppRoutes />, { route: "/" });
  expect(screen.queryByRole("button", { name: "Déconnexion" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /demo\./ })).not.toBeInTheDocument();
});

test("offers a logout to every logged-in member, whatever they can do", async () => {
  const user = userEvent.setup();
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/events" });

  await user.click(await screen.findByRole("button", { name: "demo.player" }));

  expect(await screen.findByRole("menuitem", { name: "Déconnexion" })).toBeInTheDocument();
});

/**
 * THE SERVER HALF. The browser half — landing on `/` — is a full page load,
 * which jsdom does not perform and cannot be faked here: `window.location` is
 * non-configurable, so the spy that would watch it throws "Cannot redefine
 * property: assign". Rather than bend the component into a testable shape for
 * one assertion, the landing is proven in a real browser by
 * web/e2e/members.spec.ts, and this holds the part jsdom can actually see.
 */
test("ends the session on the server", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  // FROM /members, which is where somebody actually finishes and logs out, and
  // which is the page that made three in-app versions of this fail — see
  // session/logout.ts.
  await renderWithSession(<AppRoutes />, { route: "/members" });

  await user.click(await screen.findByRole("button", { name: "demo.direction" }));
  await user.click(await screen.findByRole("menuitem", { name: "Déconnexion" }));

  await waitFor(() => expect(currentMockUser()).toBeNull());
});

/**
 * IT IS REACHABLE FROM INSIDE THE FORCED-PASSWORD GATE, which is the case the
 * whole "in the chrome, not on a page" decision exists for: that member can
 * reach /account and nothing else, so a logout living on any other route would
 * be unreachable by the one person most likely to want it.
 *
 * Mutation-tested: moving the button onto /account's own page fails this test
 * and nothing else.
 */
test("stays reachable for a member held on /account by the password gate", async () => {
  const user = userEvent.setup();
  setMockUser("demo.mustchange");
  await renderWithSession(<AppRoutes />, { route: "/members" });

  await screen.findByRole("heading", { name: "Mon compte" });
  await user.click(screen.getByRole("button", { name: "demo.mustchange" }));
  expect(await screen.findByRole("menuitem", { name: "Déconnexion" })).toBeInTheDocument();
});

test("the account menu reads German under the German locale", async () => {
  const user = userEvent.setup();
  setMockUser("demo.player");
  await renderWithSession(<Layout />, { locale: "de-CH" });

  await user.click(await screen.findByRole("button", { name: "demo.player" }));

  expect(await screen.findByRole("menuitem", { name: "Mein Konto" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Abmelden" })).toBeInTheDocument();
});

test("the nav renders in German under the German locale", async () => {
  await renderWithSession(<Layout />, { locale: "de-CH" });

  expect(screen.getByRole("navigation", { name: "Hauptnavigation" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mitmachen" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Wo Sie uns sehen" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Anmelden" })).toBeInTheDocument();
  expect(screen.getByText(/Alle Rechte vorbehalten\./)).toBeInTheDocument();
});

test("the nav is still French by default", async () => {
  await renderWithSession(<Layout />);

  expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Nous rejoindre" })).toBeInTheDocument();
});
