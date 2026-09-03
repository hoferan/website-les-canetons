import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Admin } from "./Admin";

// The page itself, not the guard around it — guards.routes.test.tsx covers who
// may reach /admin. Written when this page adopted DestinationCards, because
// nothing pinned its one card and a shared component could have dropped it
// without a single test going red.
test("the hub links the admin to the events page", async () => {
  // DOCUMENTATION, NOT A PRECONDITION. This page reads no session and holds no
  // capability check of its own — the guard lives on the route, and
  // guards.routes.test.tsx owns it — so this test passes for an anonymous
  // visitor too. The line stays because it says who the page is for; without it
  // a reader wonders why an admin-only page's test never sets a user.
  setMockUser("demo.admin");
  await renderWithSession(<Admin />);

  expect(await screen.findByRole("heading", { level: 1, name: "Administration" })).toBeVisible();

  // The list's own name, distinct from the h1. /accueil names its list
  // "Découvrir les Canetons" rather than echoing its heading, and a list whose
  // accessible name repeats the heading above it announces the same words
  // twice. Pinned so the distinction cannot quietly collapse back.
  const list = screen.getByRole("list", { name: "Actions disponibles" });
  expect(within(list).getByRole("link", { name: /^Événements/ })).toHaveAttribute(
    "href",
    "/planning_repet",
  );
});
