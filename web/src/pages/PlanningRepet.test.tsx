import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { PlanningRepet } from "./PlanningRepet";

test("the events are listed in the order the API returned them", async () => {
  await renderWithSession(<PlanningRepet />);

  const items = within(await screen.findByRole("list", { name: "Événements" })).getAllByRole(
    "listitem",
  );
  expect(items).toHaveLength(3);

  // Pins the order. The page does not re-sort, so a change in the API's
  // ordering must fail here rather than be silently corrected in the UI.
  //
  // Asserted on textContent rather than getByText: each line is split across a
  // <strong> label and a text node, and getByText matches per element, so a
  // query for "Titre : X" finds nothing even though the line reads that way.
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining("Titre : Concert d'automne"),
    expect.stringContaining("Titre : Assemblée générale"),
    expect.stringContaining("Titre : Week-end de répétition"),
  ]);
});

test("an event shows its date, times, location and attire", async () => {
  await renderWithSession(<PlanningRepet />);

  const first = within(await screen.findByRole("list", { name: "Événements" })).getAllByRole(
    "listitem",
  )[0]!;
  expect(within(first).getByText("dimanche 20 septembre 2026")).toBeInTheDocument();
  expect(first).toHaveTextContent("Heure de début : 19:00");
  expect(first).toHaveTextContent("Heure de fin : 22:00");
  expect(first).toHaveTextContent("Lieu : Salle communale");
  expect(first).toHaveTextContent("Tenue : Costume des canetons");
});

test("a weekend event shows a date range instead of one day", async () => {
  await renderWithSession(<PlanningRepet />);
  expect(
    await screen.findByText("samedi 14 novembre 2026 au dimanche 15 novembre 2026"),
  ).toBeInTheDocument();
});

test("an event with no attire omits the Tenue line entirely", async () => {
  await renderWithSession(<PlanningRepet />);
  const second = within(
    within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem")[1]!,
  );
  expect(second.queryByText(/Tenue/)).toBeNull();
});

test("an anonymous visitor can read the planning", async () => {
  await renderWithSession(<PlanningRepet />);
  expect(
    within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem"),
  ).toHaveLength(3);
});

test("a failing API renders a message rather than an empty page", async () => {
  server.use(
    http.get("/api/events", () =>
      HttpResponse.json(
        { error: "Service unavailable", code: "service_unavailable", fields: [] },
        { status: 503 },
      ),
    ),
  );

  await renderWithSession(<PlanningRepet />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Le planning n’a pas pu être chargé.");
});

test("an empty planning renders the headings and no rows, not a crash", async () => {
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  await renderWithSession(<PlanningRepet />);
  expect(
    await screen.findByRole("heading", { name: /Planning des prestations/ }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Événements" })).queryAllByRole("listitem"),
  ).toHaveLength(0);
});
