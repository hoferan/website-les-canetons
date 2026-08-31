import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Sinscrire } from "./Sinscrire";

const rows = async () =>
  within(await screen.findByRole("table", { name: "Événements à venir" })).getAllByRole("row");

test("a member who may respond gets a sign-up action", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("link", { name: "S’inscrire" })).toHaveLength(3);
  expect(screen.queryByRole("link", { name: "Résumé" })).toBeNull();
});

// The matrix is NOT a hierarchy: admin holds view_summary and NOT respond, so
// it gets the other button entirely. Every intuition about roles says an admin
// can do what a user can; here it cannot.
test("an admin gets the summary action instead, not as well", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("link", { name: "Résumé" })).toHaveLength(3);
  expect(screen.queryByRole("link", { name: "S’inscrire" })).toBeNull();
});

test("a moderator responds, like a user", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("link", { name: "S’inscrire" })).toHaveLength(3);
});

test("an event already answered shows a disabled confirmation instead", async () => {
  setMockUser("demo.user");
  const { server } = await import("../mocks/node");
  const { HttpResponse, http } = await import("msw");
  server.use(
    http.get("/api/events", () =>
      HttpResponse.json([
        {
          id: 1,
          date: "2026-09-20",
          title: "Concert d'automne",
          startTime: "19:00:00",
          endTime: "22:00:00",
          location: "Salle communale",
          attire: null,
          weekend: 0,
          response: "participate",
        },
      ]),
    ),
  );

  await renderWithSession(<Sinscrire />);
  const confirmed = await screen.findByRole("button", { name: "Choix enregistré" });
  expect(confirmed).toBeDisabled();
  expect(screen.queryByRole("link", { name: "S’inscrire" })).toBeNull();
});

// The API orders by date. The old page re-sorted client-side; dropping that
// means a change in the API's ordering fails HERE rather than being silently
// corrected in the UI.
test("the rows keep the order the API returned", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);
  const [, ...body] = await rows();
  expect(body.map((row) => within(row).getAllByRole("cell")[1]!.textContent)).toEqual([
    "Concert d'automne",
    "Assemblée générale",
    "Week-end de répétition",
  ]);
});
