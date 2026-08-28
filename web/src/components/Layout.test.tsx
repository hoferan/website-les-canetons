import { render, screen, within } from "@testing-library/react";
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

test("the nav keeps the order the old site used, not alphabetical", async () => {
  await renderWithSession(<AppRoutes />, { route: "/" });

  const nav = within(screen.getByRole("navigation"));
  const labels = nav.getAllByRole("link").map((link) => link.textContent?.trim());

  expect(labels.slice(0, 5)).toEqual([
    "Accueil",
    "Commencer les Canetons",
    "Contact Canetons",
    "Les canetons",
    "Moniteurs",
  ]);
});

test("the Galerie link is external and opens in a new tab", async () => {
  await renderWithSession(<AppRoutes />, { route: "/" });

  const galerie = screen.getByRole("link", { name: /Galerie/ });
  expect(galerie).toHaveAttribute("href", expect.stringContaining("flickr.com"));
  expect(galerie).toHaveAttribute("target", "_blank");
  // Without rel=noreferrer a target=_blank link hands the opened page a
  // window.opener reference back into this one.
  expect(galerie).toHaveAttribute("rel", "noreferrer");
});

test("the auth link says Connexion when nobody is logged in", async () => {
  await renderWithSession(<AppRoutes />, { route: "/" });
  expect(screen.getByRole("link", { name: "Connexion" })).toBeInTheDocument();
});

test("the auth link shows the username once logged in", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<AppRoutes />, { route: "/" });
  expect(screen.getByRole("link", { name: "demo.admin" })).toBeInTheDocument();
});

test("the inscription sub-pages highlight the Inscriptions item, as the old nav did", async () => {
  await renderWithSession(<AppRoutes />, { route: "/inscriptions_admin" });
  expect(screen.getByRole("link", { name: "Inscriptions" })).toHaveClass("font-bold");
});

test("the hamburger toggles the menu and reports its state", async () => {
  await renderWithSession(<AppRoutes />, { route: "/" });

  const toggle = screen.getByRole("button", { name: "Menu de navigation" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});
