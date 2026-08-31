import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { InscriptionsAdmin } from "./InscriptionsAdmin";

const app = (
  <Routes>
    <Route path="/inscriptions_admin" element={<InscriptionsAdmin />} />
  </Routes>
);

/**
 * Scoped to the tiles by name.
 *
 * The tiles and the per-member table deliberately use the same three words —
 * "Participe", "Ne participe pas", "Pas de réponse" — because the old page did.
 * An unscoped getByText therefore matches a tile AND every row carrying that
 * answer. Addressing the list by its accessible name is the same trick the
 * planning page's "Événements" list uses.
 */
const tile = async (label: string) => {
  const tiles = await screen.findByRole("list", { name: "Résumé de la participation" });
  return within(tiles).getByText(label).closest("[data-tile]") as HTMLElement;
};

test("the tiles count the roll call, the answers and the silence", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin?id=1" });

  // Convoqués is everyone the event applies to, which is only countable
  // because the endpoint returns people who have not answered too.
  expect(await tile("Convoqués")).toHaveTextContent("5");
  expect(await tile("Participe")).toHaveTextContent("3");
  expect(await tile("Ne participe pas")).toHaveTextContent("1");
  expect(await tile("Pas de réponse")).toHaveTextContent("1");
});

test("every member appears, answered or not", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin?id=1" });
  const table = await screen.findByRole("table", { name: "Réponses" });
  expect(within(table).getAllByRole("row")).toHaveLength(6); // header + 5
});

// Derived from the data, not from a hardcoded list of French instrument names
// as the old page had — that list drifted from the instruments table.
test("the register counts count participants only", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin?id=1" });
  const table = await screen.findByRole("table", { name: "Résumé des instruments" });

  const trumpet = within(table).getByRole("row", { name: /Trompette/ });
  // Two trumpets in the fixture, but one declined.
  expect(within(trumpet).getAllByRole("cell")[1]).toHaveTextContent("1");

  const drums = within(table).getByRole("row", { name: /Batterie/ });
  expect(within(drums).getAllByRole("cell")[1]).toHaveTextContent("1");
});

test("a missing id says so rather than showing an empty summary", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Aucun événement");
});
