import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Events } from "./Events";

async function renderPlanning(as: "demo.player" | "demo.direction" = "demo.player") {
  setMockUser(as);
  const result = await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");
  return result;
}

test("lists the planning for an ordinary player", async () => {
  await renderPlanning();
  expect(screen.getAllByTestId("event-card").length).toBeGreaterThan(0);
});

test("a player is offered no way to create an event", async () => {
  // ABSENT, not refused: a control that leads to "Accès refusé" teaches people
  // that parts of the site are broken for them.
  await renderPlanning("demo.player");
  expect(screen.queryByRole("link", { name: /Ajouter un événement/ })).toBeNull();
  expect(screen.queryByRole("link", { name: /Ajouter une série/ })).toBeNull();
});

test("an organiser is offered both ways to create", async () => {
  await renderPlanning("demo.direction");
  expect(screen.getByRole("link", { name: "Ajouter un événement" })).toHaveAttribute(
    "href",
    "/events/new",
  );
  expect(screen.getByRole("link", { name: "Ajouter une série" })).toHaveAttribute(
    "href",
    "/events/new/series",
  );
});

test("the past REPLACES the planning rather than extending it", async () => {
  await renderPlanning();

  // The seeded mock has five upcoming and exactly one past, so the two halves
  // are distinguishable by count as well as by content — a toggle that merely
  // appended would show six.
  expect(screen.getAllByTestId("event-card")).toHaveLength(5);

  await userEvent.click(screen.getByRole("button", { name: "Voir les événements passés" }));

  expect(await screen.findByRole("button", { name: "Voir le planning" })).toBeInTheDocument();
  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(1);
});

test("an event carries its where and its when", async () => {
  await renderPlanning();
  const cards = screen.getAllByTestId("event-card");
  const first = cards[0] as HTMLElement;

  expect(within(first).getByTestId("event-when")).not.toBeEmptyDOMElement();
  expect(within(first).getByTestId("event-location")).not.toBeEmptyDOMElement();
});

test("an event with no attire says so rather than leaving a blank", async () => {
  // "Vendanges Cheyres" in the seeded planning has none, and an empty row
  // reads as a value that failed to load.
  await renderPlanning();
  const cheyres = screen
    .getAllByTestId("event-card")
    .find((card) => within(card).queryByText("Vendanges Cheyres")) as HTMLElement;

  expect(within(cheyres).getByTestId("event-attire")).toHaveTextContent("Non précisée");
});

test("an empty planning says so rather than rendering nothing", async () => {
  // A blank screen reads as broken. This is the state a committee sees before
  // they have entered the season, which is the first thing they will ever see.
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });

  expect(await screen.findByText(/Aucun événement au planning/)).toBeInTheDocument();
  // And an organiser is pointed at what to do about it.
  expect(screen.getByText(/générez toute une saison/)).toBeInTheDocument();
});

test("a failed planning is announced, not silently empty", async () => {
  server.use(http.get("/api/events", () => HttpResponse.error()));

  setMockUser("demo.player");
  await renderWithSession(<Events />, { route: "/events" });

  expect(await screen.findByRole("alert")).toHaveTextContent(/n’a pas pu être chargé/);
});
