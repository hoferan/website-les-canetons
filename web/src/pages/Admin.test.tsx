import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Admin } from "./Admin";

// The page itself, not the guard around it — guards.routes.test.tsx covers who
// may reach /admin. Written when this page adopted DestinationCards, because
// nothing pinned its one card and a shared component could have dropped it
// without a single test going red.
test("the hub links the admin to the events page", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Admin />);

  expect(await screen.findByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
  expect(screen.getByRole("link", { name: /^Événements/ })).toHaveAttribute(
    "href",
    "/planning_repet",
  );
});
