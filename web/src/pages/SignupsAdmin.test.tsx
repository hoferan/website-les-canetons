import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { SignupsAdmin } from "./SignupsAdmin";

const app = (
  <Routes>
    <Route path="/signups_admin" element={<SignupsAdmin />} />
  </Routes>
);

/** Scoped by the list's accessible name — the layout's nav is a list too. */
const tile = async (label: string) => {
  const tiles = await screen.findByRole("list", { name: "Totaux des inscriptions" });
  return within(tiles).getByText(label).closest("[data-tile]") as HTMLElement;
};

test("the tiles total the people, the tables and each menu", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/signups_admin" });

  expect(await tile("Total personnes")).toHaveTextContent("6");
  expect(await tile("Total tables")).toHaveTextContent("3");
  expect(await tile("Viande")).toHaveTextContent("3");
  expect(await tile("Enfant")).toHaveTextContent("1");
  expect(await tile("Végétarien")).toHaveTextContent("2");
});

test("each table is a group row followed by its reservations", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/signups_admin" });
  const table = await screen.findByRole("table", { name: "Inscriptions" });

  // header + 3 group rows + 4 reservations + 1 total row
  expect(within(table).getAllByRole("row")).toHaveLength(9);

  // Five cells, not six: the group row's first cell spans "Table / Contact"
  // and "Tel.", so index 4 is the Total column.
  const group = within(table).getByRole("row", { name: /Famille Lovelace/ });
  expect(within(group).getAllByRole("cell")[4]!).toHaveTextContent("3");
});

// A zero renders as "–", not "0" — the old page's own choice, and the reason
// a 40-row table stays readable.
test("a zero count renders as a dash", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/signups_admin" });
  const table = await screen.findByRole("table", { name: "Inscriptions" });

  const row = within(table).getByRole("row", { name: /Edsger Dijkstra/ });
  const cells = within(row).getAllByRole("cell");
  expect(cells[2]!).toHaveTextContent("1"); // Viande
  expect(cells[3]!).toHaveTextContent("–"); // Enfant
  expect(cells[4]!).toHaveTextContent("–"); // Végétarien
});

test("the general total closes the table", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/signups_admin" });
  const table = await screen.findByRole("table", { name: "Inscriptions" });

  // Five cells, as on the group rows above: the label spans two columns.
  const total = within(table).getByRole("row", { name: /Total général/ });
  expect(within(total).getAllByRole("cell")[4]!).toHaveTextContent("6");
});

// A plain link, not a fetch: the generated client cannot stream a download, and
// a normal navigation carries the session cookie.
test("the export is a plain link to the xlsx endpoint", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/signups_admin" });

  expect(await screen.findByRole("link", { name: /Exporter en Excel/ })).toHaveAttribute(
    "href",
    "/api/signups?format=xlsx",
  );
});
