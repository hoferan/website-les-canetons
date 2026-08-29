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

const tile = async (label: string) =>
  (await screen.findByText(label)).closest("[data-tile]") as HTMLElement;

test("the three tiles count participating, declining and pending", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin?id=1" });

  expect(await tile("Participe")).toHaveTextContent("3");
  expect(await tile("Ne participe pas")).toHaveTextContent("1");
  // Pending is everyone who has not answered — the reason the endpoint returns
  // every user rather than only the ones who replied.
  expect(await tile("En attente")).toHaveTextContent("1");
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
