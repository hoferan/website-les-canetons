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
  // The envelope, not a bare array: an override that answered the old shape
  // would put this test in agreement with nothing the API sends.
  server.use(
    http.get("/api/v1/events", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );

  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });

  expect(await screen.findByText(/Aucun événement au planning/)).toBeInTheDocument();
  // And an organiser is pointed at what to do about it.
  expect(screen.getByText(/générez toute une saison/)).toBeInTheDocument();
});

test("a failed planning is announced, not silently empty", async () => {
  server.use(http.get("/api/v1/events", () => HttpResponse.error()));

  setMockUser("demo.player");
  await renderWithSession(<Events />, { route: "/events" });

  expect(await screen.findByRole("alert")).toHaveTextContent(/n’a pas pu être chargé/);
});

test("naming the event before deleting it", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";
  await userEvent.click(within(card).getByRole("button", { name: `Supprimer ${title}` }));

  // "Êtes-vous sûr ?" is a question nobody reads. The name is what makes the
  // dialog worth stopping for.
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(expect.stringContaining(title));
});

test("the dialog names what goes with the event, not only the event", async () => {
  // The API deletes every attendance answer and every public registration
  // attached to it, and says so in its own docblock. A confirmation that
  // mentioned neither would be naming half the damage.
  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";
  await userEvent.click(within(card).getByRole("button", { name: `Supprimer ${title}` }));

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(/réponses/);
  expect(dialog).toHaveTextContent(/inscriptions/);
});

test("a player is offered no delete at all", async () => {
  setMockUser("demo.player");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");

  expect(screen.queryByRole("button", { name: /^Supprimer/ })).toBeNull();
});

test("deleting removes it from the planning", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");
  const before = screen.getAllByTestId("event-card").length;

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";
  await userEvent.click(within(card).getByRole("button", { name: `Supprimer ${title}` }));
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  // The plan waited on a findByText matching any non-empty node, which matches
  // every node on the page and throws for multiple matches. Polling the count
  // is what the rest of this file already does.
  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(before - 1);
});

test("a delete carries the tag of the read it was confirmed from", async () => {
  // DELETE is a conditional write (A4): refused 428 without an If-Match and
  // 412 with a stale one. The planning hands out no tag — one tag cannot
  // validate five rows — so opening the dialog is also the read. Without that
  // read the mocked backend refuses exactly as the real one does, and this
  // test is what says so.
  let sentIfMatch: string | null = null;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "DELETE") {
      sentIfMatch = request.headers.get("If-Match");
    }
  });

  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";
  await userEvent.click(within(card).getByRole("button", { name: `Supprimer ${title}` }));
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  await expect.poll(() => sentIfMatch).not.toBeNull();
});
