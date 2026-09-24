import { render, screen, waitFor, within } from "@testing-library/react";
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

/**
 * THE NAV HAS TWO SHAPES (#99): a desktop bar with the account under an avatar,
 * and a phone list that exists only while the Menu is open. jsdom applies no
 * CSS, so the desktop bar is always in the tree here; a phone test opens the
 * Menu first, and names the phone account row by the username it shows.
 */
const openPhoneMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Menu de navigation" }));

test("the desktop avatar opens the account menu once logged in", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  const trigger = screen.getByRole("button", { name: /^Compte de demo\.direction/ });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  expect(screen.queryByRole("link", { name: "Connexion" })).toBeNull();
});

test("the desktop menu names who is logged in, then the account, the committee's screens and the way out", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });

  await user.click(screen.getByRole("button", { name: /^Compte de demo\.direction/ }));

  const menu = await screen.findByRole("menu");
  expect(menu).toHaveTextContent("Dominique Direction");
  const items = screen.getAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "Mon compte",
    "Membres",
    "Boîte de réception2",
    "Déconnexion",
  ]);
  // Not back at the login form: the member's own account.
  expect(items[0]).toHaveAttribute("href", "/account");
  expect(items[1]).toHaveAttribute("href", "/members");
});

/**
 * THE COMMITTEE'S SCREENS LEFT THE BAR (#99), so the bar keeps to pages and
 * fits on one line. Their count moved onto the avatar.
 */
test("the committee's screens are under the avatar, not in the desktop bar", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });

  expect(screen.queryByRole("link", { name: "Membres" })).toBeNull();
  expect(screen.queryByRole("link", { name: /Boîte de réception/ })).toBeNull();
  expect(
    await screen.findByRole("button", { name: "Compte de demo.direction, 2 en attente" }),
  ).toBeInTheDocument();
});

test("a member with no committee screen gets only the account and the way out", async () => {
  const user = userEvent.setup();
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/login" });

  await user.click(screen.getByRole("button", { name: "Compte de demo.player" }));

  // ABSENT, not refused: a link that leads to "Accès refusé" teaches people
  // that parts of the site are broken for them.
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual(["Mon compte", "Déconnexion"]);
});

/**
 * THE PHONE MENU IS A FULL-SCREEN LAYER (#99, "Scène"): the member's own
 * screens first, then the public pages, and the account in a footer, last.
 */
test("the phone layer puts the member's screens first and the account last", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  await openPhoneMenu(user);

  const layer = await screen.findByRole("dialog", { name: "Menu" });
  const mine = within(layer).getByRole("list", { name: "Mon espace" });
  expect(
    within(mine)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual(["/events", "/members", "/inbox"]);
  const band = within(layer).getByRole("list", { name: "Le groupe" });
  expect(within(band).getByRole("link", { name: "Nous rejoindre" })).toBeInTheDocument();

  // The account comes after both lists.
  const account = within(layer).getByRole("link", { name: "Mon compte" });
  expect(band.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(layer).getByRole("button", { name: "Déconnexion" })).toBeInTheDocument();
});

test("a player's card holds only Événements", async () => {
  const user = userEvent.setup();
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  await openPhoneMenu(user);

  const mine = await screen.findByRole("list", { name: "Mon espace" });
  expect(
    within(mine)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Événements"]);
});

test("logged out, the phone list has no headings and ends with Connexion", async () => {
  const user = userEvent.setup();
  await renderWithSession(<AppRoutes />, { route: "/" });
  await openPhoneMenu(user);

  expect(screen.queryByText("Mon espace")).toBeNull();
  expect(screen.queryByText("Le groupe")).toBeNull();
  const links = within(document.getElementById("nav-menu")!).getAllByRole("link");
  expect(links.at(-1)).toHaveAccessibleName("Connexion");
});

/**
 * #99's whole point: the name and the logout used to sit side by side as nav
 * items, one stray click apart. Until a menu is opened there is no logout
 * anywhere in the tree.
 */
test("keeps the logout out of reach until a menu is opened", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/events" });

  await screen.findByRole("button", { name: "Compte de demo.player" });
  expect(screen.queryByText("Déconnexion")).toBeNull();
});

test("marks the account as the current page on /account", async () => {
  const user = userEvent.setup();
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/account" });
  await screen.findByRole("heading", { name: "Mon compte" });

  await openPhoneMenu(user);
  const layer = await screen.findByRole("dialog", { name: "Menu" });
  expect(within(layer).getByRole("link", { name: "Mon compte" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await user.click(within(layer).getByRole("button", { name: "Fermer le menu" }));

  await user.click(screen.getByRole("button", { name: "Compte de demo.player" }));
  expect(await screen.findByRole("menuitem", { name: "Mon compte" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("hides the committee's screens from an anonymous visitor", async () => {
  const user = userEvent.setup();
  await renderWithSession(<AppRoutes />, { route: "/login" });
  await openPhoneMenu(user);
  expect(screen.queryByRole("link", { name: "Membres" })).toBeNull();
});

test("the Menu button opens the layer, and the ✕ and Escape close it", async () => {
  const user = userEvent.setup();
  await renderWithSession(<AppRoutes />, { route: "/login" });

  const toggle = screen.getByRole("button", { name: "Menu de navigation" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByRole("button", { name: "Fermer le menu" }));
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("dialog")).toBeNull();

  await user.click(toggle);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("choosing a page in the layer closes it", async () => {
  const user = userEvent.setup();
  await renderWithSession(<AppRoutes />, { route: "/login" });
  await openPhoneMenu(user);

  const layer = await screen.findByRole("dialog", { name: "Menu" });
  await user.click(within(layer).getByRole("link", { name: "Contact" }));

  expect(screen.queryByRole("dialog")).toBeNull();
});

test("shows Événements to any logged-in member, first in the bar", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/login" });
  const bar = screen.getByRole("navigation", { name: "Navigation principale" });
  const first = within(within(bar).getAllByRole("list")[0]!).getAllByRole("link")[0];
  expect(first).toHaveAccessibleName("Événements");
  expect(first).toHaveAttribute("href", "/events");
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

  await user.click(await screen.findByRole("button", { name: "Compte de demo.player" }));

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

  await user.click(await screen.findByRole("button", { name: /^Compte de demo\.direction/ }));
  await user.click(await screen.findByRole("menuitem", { name: "Déconnexion" }));

  await waitFor(() => expect(currentMockUser()).toBeNull());
});

test("ends the session from the phone layer too", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/members" });

  await screen.findByRole("heading", { name: "Membres" });
  await openPhoneMenu(user);
  await user.click(screen.getByRole("button", { name: "Déconnexion" }));

  await waitFor(() => expect(currentMockUser()).toBeNull());
});

/**
 * IT IS REACHABLE FROM INSIDE THE FORCED-PASSWORD GATE, which is the case the
 * whole "in the chrome, not on a page" decision exists for: that member can
 * reach /account/password and nothing else, so a logout living on any other route would
 * be unreachable by the one person most likely to want it.
 *
 * Mutation-tested: moving the button onto the password page fails this test
 * and nothing else.
 */
test("stays reachable for a member held on /account/password by the password gate", async () => {
  const user = userEvent.setup();
  setMockUser("demo.mustchange");
  await renderWithSession(<AppRoutes />, { route: "/members" });

  await screen.findByRole("heading", { level: 1, name: "Mot de passe" });
  await user.click(screen.getByRole("button", { name: "Compte de demo.mustchange" }));
  expect(await screen.findByRole("menuitem", { name: "Déconnexion" })).toBeInTheDocument();
});

test("the account menu reads German under the German locale", async () => {
  const user = userEvent.setup();
  setMockUser("demo.player");
  await renderWithSession(<Layout />, { locale: "de-CH" });

  await user.click(await screen.findByRole("button", { name: "Konto von demo.player" }));

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
