import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { History } from "./History";
import { HistoryEdit } from "./HistoryEdit";
import { HistoryNew } from "./HistoryNew";

async function renderAt(route: string) {
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/history" element={<History />} />
      <Route path="/history/new" element={<HistoryNew />} />
      <Route path="/history/:id/edit" element={<HistoryEdit />} />
    </Routes>,
    { route },
  );
}

test("a new entry with only a German text is saved and appears on the timeline", async () => {
  const user = userEvent.setup();
  await renderAt("/history/new");
  await user.type(await screen.findByLabelText(/^Date/), "2024-02-11");
  await user.selectOptions(screen.getByLabelText("Précision de la date"), "day");
  await user.type(screen.getByLabelText("Texte en allemand"), "Umzug am Fasnachtssonntag");
  await user.click(screen.getByRole("radio", { name: "Étoile" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  // INSIDE THE TIMELINE, not anywhere on screen. React keeps a controlled
  // textarea's text content in step with its value, so an unscoped findByText
  // can match the form's own textarea while the save is in flight, and then
  // lose it when the navigation unmounts the form.
  const timeline = await screen.findByTestId("history-timeline");
  expect(within(timeline).getByText("Umzug am Fasnachtssonntag")).toBeInTheDocument();
  expect(within(timeline).getByText("11.02.2024")).toBeInTheDocument();
});

/**
 * MUTATION TEST: drop the client-side all-empty check and the message still
 * arrives, from the mock's 422, but focus stays on the button.
 */
test("four empty text fields are refused before anything is sent", async () => {
  const user = userEvent.setup();
  await renderAt("/history/new");
  await user.type(await screen.findByLabelText(/^Date/), "2024-02-11");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(
    await screen.findByText("Écrivez au moins un titre ou un texte, en français ou en allemand."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Titre en français")).toHaveFocus();
});

/** MUTATION TEST: drop `ifMatch(etag)` from the update and the mock answers 428. */
test("editing opens with the entry's values and saves with its tag", async () => {
  const user = userEvent.setup();
  await renderAt("/history/3/edit");
  const title = await screen.findByLabelText("Titre en français");
  expect(title).toHaveValue("Delphine Maillard et Laura Mantel");
  expect(screen.getByRole("radio", { name: "Musique" })).toBeChecked();

  await user.clear(title);
  await user.type(title, "La direction de 2019");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  const timeline = await screen.findByTestId("history-timeline");
  expect(within(timeline).getByText("La direction de 2019")).toBeInTheDocument();
});

test("a save against an entry changed meanwhile stays on the form and says so", async () => {
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/history/:id", () =>
      HttpResponse.json(
        {
          title: "Precondition Failed",
          status: 412,
          code: "if_match_failed",
          instance: "/api/v1/history/3",
          errors: [],
          requestId: "01JB3K7QW8ZX7VN4S2QK9J0M1P",
          detail: "stale",
        },
        { status: 412 },
      ),
    ),
  );
  await renderAt("/history/3/edit");
  await user.click(await screen.findByRole("button", { name: "Enregistrer" }));

  expect(
    await screen.findByText(/Quelqu'un a modifié cet élément entre-temps/),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Titre en français")).toBeInTheDocument();
});

test("an entry that no longer exists says so instead of opening a form", async () => {
  await renderAt("/history/99/edit");

  expect(await screen.findByRole("alert")).toHaveTextContent("L’entrée n’a pas pu être chargée.");
  expect(screen.queryByLabelText("Titre en français")).toBeNull();
});
