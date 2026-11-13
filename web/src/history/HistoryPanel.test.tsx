import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { EDIT_MODE_KEY } from "../content/EditMode";
import type { Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { History } from "../pages/History";
import { renderWithSession } from "../test/renderWithSession";

/**
 * The history page in edit mode with the side panel open (#419): "new" opens
 * it from "Ajouter", a number from that entry's ✎ on its card.
 */
async function renderAt(
  open: "new" | number,
  {
    locale = "fr",
    as = "demo.direction",
  }: { locale?: Locale; as?: Parameters<typeof setMockUser>[0] } = {},
) {
  const user = userEvent.setup();
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser(as);
  await renderWithSession(<History />, { route: "/history", locale });
  await screen.findByTestId("history-timeline");
  if (open === "new") {
    await user.click(
      screen.getByRole("button", { name: /^(Ajouter à l’histoire|Zur Geschichte hinzufügen)$/ }),
    );
  } else {
    const pencil = document.querySelector<HTMLElement>(
      `[data-entry-id="${open}"] [data-action="edit"]`,
    );
    if (!pencil) throw new Error(`no ✎ on entry ${open}`);
    await user.click(pencil);
  }
  await screen.findByRole("dialog");
}

/**
 * The timeline once the panel has closed. While it is open the page shows
 * what is typed, so a text on the timeline proves a save only after that.
 */
async function timeline() {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  return screen.findByTestId("history-timeline");
}

test("a new entry with only a German text and an exact date is saved and appears on the timeline", async () => {
  const user = userEvent.setup();
  await renderAt("new");
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
 * A year is asked for as a year. A full date field would make the committee
 * invent a day, silently dropped and shown as 01.01 on the next edit.
 */
test("a year entry asks for the year only, previews it, and saves it", async () => {
  const user = userEvent.setup();
  await renderAt("new");
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
  await renderAt("new");
  await user.selectOptions(await screen.findByLabelText("Précision de la date"), "month");
  await user.selectOptions(screen.getByLabelText(/^Mois/), "10");
  await user.type(screen.getByLabelText(/^Année/), "2002");

  expect(screen.getByTestId("history-preview")).toHaveTextContent("octobre 2002");
});

test("editing a year entry opens on its year, with no day to invent", async () => {
  await renderAt(3);
  const year = await screen.findByLabelText(/^Année/);
  expect(year).toHaveValue("2019");
  // A text field with a numeric keypad, not type=number: a scroll wheel over
  // a number field changes the year.
  expect(year).toHaveAttribute("type", "text");
  expect(year).toHaveAttribute("inputmode", "numeric");
  expect(screen.getByLabelText("Précision de la date")).toHaveValue("year");
  expect(screen.queryByLabelText(/^Date/)).toBeNull();
});

/**
 * Without the client-side all-empty check the message still arrives, from the
 * mock's 422, but the fields are not marked or described.
 */
test("four empty text fields are refused before sending, next to the fields", async () => {
  const user = userEvent.setup();
  await renderAt("new");
  await user.type(await screen.findByLabelText(/^Année/), "2024");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  const titleFr = screen.getByLabelText("Titre en français");
  expect(titleFr).toHaveFocus();
  expect(titleFr).toHaveAttribute("aria-invalid", "true");
  expect(titleFr).toHaveAccessibleDescription(/Écrivez au moins un titre ou un texte/);
  expect(screen.getByLabelText("Texte en allemand")).toHaveAttribute("aria-invalid", "true");
});

test("the rule comes before the fields it is about, and describes each of them", async () => {
  await renderAt("new");
  const titleFr = await screen.findByLabelText("Titre en français");
  expect(titleFr).toHaveAccessibleDescription(/Au moins un titre ou un texte/);

  const rule = screen.getByText(/Au moins un titre ou un texte/);
  expect(rule.compareDocumentPosition(titleFr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("a title stops at 120 characters and says how many are used", async () => {
  const user = userEvent.setup();
  await renderAt("new");
  const titleFr = await screen.findByLabelText("Titre en français");
  expect(titleFr).toHaveAttribute("maxlength", "120");

  await user.type(titleFr, "Carnaval");
  expect(screen.getByTestId("titleFr-count")).toHaveTextContent("8 / 120");
  // Read as words, not as "huit barre oblique cent vingt".
  expect(titleFr).toHaveAccessibleDescription(/8 caractères sur 120/);
});

test("the chosen icon is named where a sighted user can read it", async () => {
  const user = userEvent.setup();
  await renderAt("new");
  await user.click(await screen.findByRole("radio", { name: "Trophée" }));

  expect(screen.getByTestId("icon-chosen")).toHaveTextContent("Trophée");
});

/** Without `ifMatch(etag)` on the update the mock answers 428. */
test("editing opens with the entry's values and saves with its tag", async () => {
  const user = userEvent.setup();
  await renderAt(3);
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
  await renderAt(3);
  await user.click(await screen.findByRole("button", { name: "Enregistrer" }));

  expect(
    await screen.findByText(/Quelqu'un a modifié cet élément entre-temps/),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Titre en français")).toBeInTheDocument();
});

/** Deleted by a colleague after the page loaded: the card is still there, its read is not. */
test("an entry that no longer exists says so instead of opening a form", async () => {
  server.use(
    http.get("/api/v1/history/:id", () =>
      HttpResponse.json(
        {
          title: "Not Found",
          status: 404,
          code: "not_found",
          instance: "/api/v1/history/3",
          errors: [],
          requestId: "01JB3K7QW8ZX7VN4S2QK9J0M1P",
          detail: "gone",
        },
        { status: 404 },
      ),
    ),
  );
  await renderAt(3);

  expect(await screen.findByRole("alert")).toHaveTextContent("L’entrée n’a pas pu être chargée.");
  expect(screen.queryByLabelText("Titre en français")).toBeNull();
});

test("the German form punctuates its labels the German way", async () => {
  await renderAt("new", { locale: "de-CH" });
  expect(await screen.findByText("Auf der Zeitleiste:")).toBeInTheDocument();
  expect(screen.getByTestId("icon-chosen").parentElement).toHaveTextContent(/^: Keines$/);
});

/** A missing month is reported at the month. */
test("a month entry without its month says so at the month", async () => {
  const user = userEvent.setup();
  await renderAt("new");
  await user.selectOptions(await screen.findByLabelText("Précision de la date"), "month");
  await user.type(screen.getByLabelText(/^Année/), "2002");
  await user.type(screen.getByLabelText("Titre en français"), "Premier cortège");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  const month = screen.getByLabelText(/^Mois/);
  expect(month).toHaveFocus();
  expect(month).toHaveAttribute("aria-invalid", "true");
  expect(month).toHaveAccessibleDescription("Choisissez le mois.");
});

/**
 * Switching the precision keeps what is known, so the preview never shows a
 * date nobody entered.
 */
test("narrowing an exact date keeps its month and year, and widening it back keeps the day", async () => {
  const user = userEvent.setup();
  await renderAt("new");
  const precision = await screen.findByLabelText("Précision de la date");
  await user.selectOptions(precision, "day");
  await user.type(screen.getByLabelText(/^Date/), "2016-11-11");

  await user.selectOptions(precision, "month");
  expect(screen.getByLabelText(/^Mois/)).toHaveValue("11");
  expect(screen.getByLabelText(/^Année/)).toHaveValue("2016");
  expect(screen.getByTestId("history-preview")).toHaveTextContent("novembre 2016");

  await user.selectOptions(precision, "day");
  expect(screen.getByLabelText(/^Date/)).toHaveValue("2016-11-11");
});

test("widening a year entry offers no day it does not know", async () => {
  const user = userEvent.setup();
  await renderAt(3);
  await user.selectOptions(await screen.findByLabelText("Précision de la date"), "day");
  expect(screen.getByLabelText(/^Date/)).toHaveValue("");
});

test("the form keys its required marks", async () => {
  await renderAt("new");
  expect(await screen.findByText(/champ obligatoire/)).toBeInTheDocument();
});

/** One message: the rule itself turns into the error. */
test("an empty save turns the rule into the error rather than repeating it", async () => {
  const user = userEvent.setup();
  await renderAt("new");
  await user.type(await screen.findByLabelText(/^Année/), "2024");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(screen.queryByText(/Au moins un titre ou un texte/)).toBeNull();
  expect(screen.getAllByText(/Écrivez au moins un titre ou un texte/)).toHaveLength(1);
});

test("nothing is read out as punctuation while the date is incomplete", async () => {
  const user = userEvent.setup();
  await renderAt("new");
  await user.selectOptions(await screen.findByLabelText("Précision de la date"), "month");

  expect(screen.getByRole("option", { name: "Choisir le mois" })).toBeInTheDocument();
  expect(screen.getByTestId("history-preview")).toHaveTextContent("date à compléter");
});

test("saving says so on the timeline", async () => {
  const user = userEvent.setup();
  await renderAt("new");
  await user.type(await screen.findByLabelText(/^Année/), "2024");
  await user.type(screen.getByLabelText("Titre en français"), "Nouveau");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await timeline();
  await expect.poll(() => screen.getByRole("status").textContent).toBe("Entrée enregistrée.");
});

test("the German form names the months in German", async () => {
  await renderAt("new", { locale: "de-CH" });
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Genauigkeit des Datums"), "month");
  expect(screen.getByRole("option", { name: "Oktober" })).toBeInTheDocument();
});

/**
 * Every history write in order, each read by a handler that then lets the mock
 * answer. The entry and its photo slot are separate writes, and which ones happen,
 * in which order, is the behaviour under test.
 */
function recordHistoryWrites(): { method: string; path: string; body: Record<string, unknown> }[] {
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const record = async ({ request }: { request: Request }) => {
    writes.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: (await request.clone().json()) as Record<string, unknown>,
    });
  };
  server.use(
    http.post("/api/v1/history", record),
    http.put("/api/v1/history/:id", record),
    http.put("/api/v1/photo-slots/:slot", record),
  );
  return writes;
}

test("a new entry with a photo is saved first, then its photo by its own write", async () => {
  const user = userEvent.setup();
  const writes = recordHistoryWrites();
  await renderAt("new");

  await user.type(await screen.findByLabelText(/^Année/), "2024");
  await user.type(screen.getByLabelText("Titre en français"), "Le cortège");
  await user.click(screen.getByRole("button", { name: "Choisir" }));
  await user.click(await screen.findByRole("button", { name: "Le groupe au Carnaval 2026" }));
  // No alt text to fill in: the entry's title describes the photo.
  expect(screen.queryByLabelText(/Texte alternatif/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  // The timeline shows the new entry with its photo, named after the title.
  expect(
    await within(await timeline()).findByRole("img", { name: "Le cortège" }),
  ).toBeInTheDocument();
  expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
    "POST /api/v1/history",
    "PUT /api/v1/photo-slots/history-5",
  ]);
  expect(writes[0]?.body).not.toHaveProperty("imageId");
  // The slot's label and page are how the library lists where the photo is.
  expect(writes[1]?.body).toEqual({
    imageId: 1,
    label: "Histoire\u00a0: Le cortège",
    path: "/history",
  });
});

test("clearing the photo saves the entry, then empties its photo", async () => {
  const user = userEvent.setup();
  const writes = recordHistoryWrites();
  await renderAt(4);

  await user.click(await screen.findByRole("button", { name: "Retirer" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[0]).toMatchObject({ method: "PUT", path: "/api/v1/history/4" });
  expect(writes[0]?.body).not.toHaveProperty("imageId");
  expect(writes[1]).toEqual({
    method: "PUT",
    path: "/api/v1/photo-slots/history-4",
    body: { imageId: null, label: "Histoire\u00a0: Le flambeau passe", path: "/history" },
  });
});

test("an untouched photo is not written at all", async () => {
  const user = userEvent.setup();
  const writes = recordHistoryWrites();
  await renderAt(4);
  await screen.findByTestId("photo-field");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await within(await timeline()).findByRole("img", { name: "Le flambeau passe" });
  expect(writes.map((write) => write.path)).toEqual(["/api/v1/history/4"]);
});

test("an editor without images.manage sees the photo, cannot change it, and writes only the entry", async () => {
  const user = userEvent.setup();
  const writes = recordHistoryWrites();
  await renderAt(4, { as: "demo.roster" });
  const field = await screen.findByTestId("photo-field");
  expect(within(field).queryByRole("button")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  await within(await timeline()).findByRole("img", { name: "Le flambeau passe" });
  expect(writes.map((write) => write.path)).toEqual(["/api/v1/history/4"]);
});

/**
 * Navigating without `photoFailed` would land the editor on a timeline that
 * never says the photo is missing.
 */
test("a photo that fails to save after its entry did is reported on the timeline", async () => {
  const user = userEvent.setup();
  const writes = recordHistoryWrites();
  server.use(http.put("/api/v1/photo-slots/:slot", () => HttpResponse.json({}, { status: 503 })));
  await renderAt(4);

  await user.click(await screen.findByRole("button", { name: "Retirer" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  // Until the save navigates away, the form's FormError is an empty
  // role="alert" and findByRole would take it, so wait for the text.
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "L’entrée est enregistrée, mais pas sa photo.",
    ),
  );
  await timeline();
  expect(writes.filter((write) => write.path === "/api/v1/history/4")).toHaveLength(1);
});

/** The titles on the timeline, top to bottom, as the page shows them. */
function titlesOnPage(): string[] {
  return [...screen.getByTestId("history-timeline").querySelectorAll("li")].map(
    (item) => item.querySelector("h2")?.textContent ?? "",
  );
}

/**
 * #419: the page is the preview. The card shows what is typed, and Annuler,
 * once the question is answered, gives back the stored entry. Nothing is
 * written.
 */
test("the card shows what is typed, and Annuler gives the stored entry back", async () => {
  const user = userEvent.setup();
  const writes = recordHistoryWrites();
  await renderAt(3);
  const title = await screen.findByLabelText("Titre en français");
  await user.clear(title);
  await user.type(title, "Les nouvelles directrices");

  await waitFor(() => expect(titlesOnPage()).toContain("2019, Les nouvelles directrices"));
  // The panel names the entry as typed, as a card's editor does.
  expect(
    screen.getByRole("dialog", { name: "Histoire · Les nouvelles directrices" }),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Annuler" }));
  await user.click(await screen.findByRole("button", { name: "Abandonner" }));
  const line = await timeline();
  expect(within(line).getByText("Delphine Maillard et Laura Mantel")).toBeInTheDocument();
  expect(within(line).queryByText("Les nouvelles directrices")).toBeNull();
  expect(writes).toEqual([]);
});

test("a new entry appears at its date while it is written, and is gone if abandoned", async () => {
  const user = userEvent.setup();
  const writes = recordHistoryWrites();
  await renderAt("new");
  await user.type(await screen.findByLabelText(/^Année/), "2010");
  await user.type(screen.getByLabelText("Titre en français"), "Premier voyage");

  // Between 2007 and 2019, as the server will sort it.
  await waitFor(() =>
    expect(titlesOnPage()).toEqual([
      expect.stringMatching(/octobre 2002, Les débuts$/),
      "2007",
      "2010, Premier voyage",
      "2019, Delphine Maillard et Laura Mantel",
      "2026, Le flambeau passe",
    ]),
  );

  await user.click(screen.getByRole("button", { name: "Annuler" }));
  await user.click(await screen.findByRole("button", { name: "Abandonner" }));
  await timeline();
  expect(titlesOnPage()).not.toContain("2010, Premier voyage");
  expect(writes).toEqual([]);
});

test("a changed year moves the card to its new place on the timeline", async () => {
  const user = userEvent.setup();
  await renderAt(4);
  const year = await screen.findByLabelText(/^Année/);
  await user.clear(year);
  await user.type(year, "2005");

  await waitFor(() => expect(titlesOnPage()[1]).toBe("2005, Le flambeau passe"));
});

/** While the panel is open, what shows is what a visitor would see. */
test("the page's own edit controls step aside while the panel is open", async () => {
  await renderAt(3);
  // The entries' strips. The hero is a block of its own and keeps its chip.
  expect(document.querySelectorAll("[data-action-bar='strip']")).toHaveLength(0);
  expect(screen.getByRole("toolbar", { name: "Histoire · en-tête" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ajouter à l’histoire" })).toBeNull();
});

test("Supprimer in the panel's ⋯ deletes the entry once asked, and closes the panel", async () => {
  const user = userEvent.setup();
  await renderAt(4);
  await user.click(
    await screen.findByRole("button", { name: "Plus d’actions : Le flambeau passe" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
  const question = await screen.findByRole("alertdialog");
  await user.click(within(question).getByRole("button", { name: "Supprimer" }));

  const line = await timeline();
  await waitFor(() => expect(within(line).queryByText("Le flambeau passe")).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Ajouter à l’histoire" })).toHaveFocus(),
  );
});
