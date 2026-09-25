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

/**
 * The saved text is looked for INSIDE THE TIMELINE, not anywhere on screen.
 * React keeps a controlled textarea's text content in step with its value, so
 * an unscoped findByText can match the form's own textarea while the save is
 * in flight, and then lose it when the navigation unmounts the form.
 */
async function timeline() {
  return screen.findByTestId("history-timeline");
}

test("a new entry with only a German text and an exact date is saved and appears on the timeline", async () => {
  const user = userEvent.setup();
  await renderAt("/history/new");
  await user.selectOptions(await screen.findByLabelText("Précision de la date"), "day");
  await user.type(screen.getByLabelText(/^Date/), "2024-02-11");
  await user.type(screen.getByLabelText("Texte en allemand"), "Umzug am Fasnachtssonntag");
  await user.click(screen.getByRole("radio", { name: "Étoile" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  const line = await timeline();
  expect(within(line).getByText("Umzug am Fasnachtssonntag")).toBeInTheDocument();
  expect(within(line).getByText("11.02.2024")).toBeInTheDocument();
});

/**
 * A YEAR IS ASKED FOR AS A YEAR (#104's review). A full date field for a year
 * entry made the committee invent a day, which was then silently dropped and
 * came back as 01.01 on the next edit.
 */
test("a year entry asks for the year only, previews it, and saves it", async () => {
  const user = userEvent.setup();
  await renderAt("/history/new");
  expect(await screen.findByLabelText("Précision de la date")).toHaveValue("year");
  expect(screen.queryByLabelText(/^Date/)).toBeNull();

  await user.type(screen.getByLabelText(/^Année/), "2015");
  expect(screen.getByTestId("history-preview")).toHaveTextContent("2015");
  await user.type(screen.getByLabelText("Titre en français"), "Premier prix");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  const line = await timeline();
  expect(within(line).getByText("Premier prix")).toBeInTheDocument();
  expect(within(line).queryByText("01.01.2015")).toBeNull();
});

test("a month entry asks for the month and the year", async () => {
  const user = userEvent.setup();
  await renderAt("/history/new");
  await user.selectOptions(await screen.findByLabelText("Précision de la date"), "month");
  await user.selectOptions(screen.getByLabelText(/^Mois/), "10");
  await user.type(screen.getByLabelText(/^Année/), "2002");

  expect(screen.getByTestId("history-preview")).toHaveTextContent("octobre 2002");
});

test("editing a year entry opens on its year, with no day to invent", async () => {
  await renderAt("/history/3/edit");
  expect(await screen.findByLabelText(/^Année/)).toHaveValue(2019);
  expect(screen.getByLabelText("Précision de la date")).toHaveValue("year");
  expect(screen.queryByLabelText(/^Date/)).toBeNull();
});

/**
 * MUTATION TEST: drop the client-side all-empty check and the message still
 * arrives, from the mock's 422, but the fields are not marked or described.
 */
test("four empty text fields are refused before sending, next to the fields", async () => {
  const user = userEvent.setup();
  await renderAt("/history/new");
  await user.type(await screen.findByLabelText(/^Année/), "2024");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  const titleFr = screen.getByLabelText("Titre en français");
  expect(titleFr).toHaveFocus();
  expect(titleFr).toHaveAttribute("aria-invalid", "true");
  expect(titleFr).toHaveAccessibleDescription(/Écrivez au moins un titre ou un texte/);
  expect(screen.getByLabelText("Texte en allemand")).toHaveAttribute("aria-invalid", "true");
});

test("the rule comes before the fields it is about, and describes each of them", async () => {
  await renderAt("/history/new");
  const titleFr = await screen.findByLabelText("Titre en français");
  expect(titleFr).toHaveAccessibleDescription(/Au moins un titre ou un texte/);

  const rule = screen.getByText(/Au moins un titre ou un texte/);
  expect(rule.compareDocumentPosition(titleFr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("a title stops at 120 characters and says how many are used", async () => {
  const user = userEvent.setup();
  await renderAt("/history/new");
  const titleFr = await screen.findByLabelText("Titre en français");
  expect(titleFr).toHaveAttribute("maxlength", "120");

  await user.type(titleFr, "Carnaval");
  expect(screen.getByTestId("titleFr-count")).toHaveTextContent("8 / 120");
});

test("the chosen icon is named where a sighted user can read it", async () => {
  const user = userEvent.setup();
  await renderAt("/history/new");
  await user.click(await screen.findByRole("radio", { name: "Trophée" }));

  expect(screen.getByTestId("icon-chosen")).toHaveTextContent("Trophée");
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

  expect(within(await timeline()).getByText("La direction de 2019")).toBeInTheDocument();
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

test("the German form punctuates its labels the German way", async () => {
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/history/new" element={<HistoryNew />} />
    </Routes>,
    { route: "/history/new", locale: "de-CH" },
  );
  expect(await screen.findByText("Auf der Zeitleiste:")).toBeInTheDocument();
  expect(screen.getByTestId("icon-chosen").parentElement).toHaveTextContent(/^: Keines$/);
});
