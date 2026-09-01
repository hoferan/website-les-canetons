import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Sinscrire } from "./Sinscrire";

const cards = async () =>
  within(await screen.findByRole("list", { name: "Événements à venir" })).getAllByRole("listitem");

test("a member who may respond gets both answers on every event", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("button", { name: "Je participe" })).toHaveLength(3);
  expect(screen.getAllByRole("button", { name: "Je ne participe pas" })).toHaveLength(3);
  expect(screen.queryByRole("link", { name: "Résumé" })).toBeNull();
});

// The matrix is NOT a hierarchy: admin holds view_summary and NOT respond, so
// it gets the other action entirely. Every intuition about roles says an admin
// can do what a user can; here it cannot.
test("an admin gets the summary action instead, not as well", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("link", { name: "Résumé" })).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "Je participe" })).toBeNull();
});

test("a moderator responds, like a user", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("button", { name: "Je participe" })).toHaveLength(3);
});

test("answering an event takes one tap and shows the saved answer", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);

  const first = (await cards())[0]!;
  await user.click(within(first).getByRole("button", { name: "Je participe" }));

  expect(await within(first).findByText("Je participe")).toBeInTheDocument();
  expect(within(first).getByRole("button", { name: "Modifier" })).toBeInTheDocument();
});

// The API has ALWAYS allowed this — ResponseController::store upserts on
// (user_id, event_id) and its own comment says "Answering again overwrites".
// Only the UI forbade it, with a disabled "Choix enregistré" button, which made
// a mistap permanent. One-tap answering is only safe because of this.
test("an answer can be changed", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  const { server } = await import("../mocks/node");
  const { HttpResponse, http } = await import("msw");
  const { SEED } = await import("../mocks/handlers");
  // Looked up by TITLE, not by index: SEED starts with a past event, so an
  // index here would silently point at the wrong one. Its date is an offset
  // from today, like the rest of the fixture — a hardcoded one would fall out
  // of the upcoming default on its own date.
  const concert = SEED.find((event) => event.title === "Concert d'automne")!;
  server.use(
    http.get("/api/events", () => HttpResponse.json([{ ...concert, response: "participate" }])),
  );

  await renderWithSession(<Sinscrire />);
  await user.click(await screen.findByRole("button", { name: "Modifier" }));
  expect(await screen.findByRole("button", { name: "Je ne participe pas" })).toBeInTheDocument();
});

// The API orders by date. The old page re-sorted client-side; dropping that
// means a change in the API's ordering fails HERE rather than being silently
// corrected in the UI.
test("the cards keep the order the API returned", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);
  expect((await cards()).map((card) => card.textContent)).toEqual([
    expect.stringContaining("Concert d'automne"),
    expect.stringContaining("Assemblée générale"),
    expect.stringContaining("Week-end de répétition"),
  ]);
});
