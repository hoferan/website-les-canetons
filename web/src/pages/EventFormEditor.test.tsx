import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Link, Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";

import type { ReplaceRegistrationOptionsRequest } from "../api/generated/model";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EventFormEditor } from "./EventFormEditor";

/** The seeded souper: three menus, then a heading, a yes/no, a choice and a text. */
const SOUPER = 7;
/** An event with no form at all. */
const REHEARSAL = 1;

async function renderEditor(eventId = SOUPER) {
  setMockUser("demo.direction");
  const result = await renderWithSession(
    <Routes>
      <Route
        path="/events/:id/book/edit"
        element={
          <>
            <EventFormEditor />
            <Link to="/elsewhere">ailleurs</Link>
          </>
        }
      />
      <Route path="/elsewhere" element={<p>Ailleurs</p>} />
    </Routes>,
    { route: `/events/${eventId}/book/edit` },
  );
  await screen.findByRole("region", { name: "Réglages du formulaire" });
  return result;
}

/** One block of the form, closed or open, by what the committee named it. */
function block(name: string) {
  return within(screen.getByRole("listitem", { name }));
}

/** Every PUT the screen sends, as sent. */
function capturePuts() {
  const sent: { body: ReplaceRegistrationOptionsRequest; ifMatch: string | null }[] = [];
  // resetHandlers() leaves listeners alone, so one from an earlier test would
  // still be counting.
  server.events.removeAllListeners("request:start");
  server.events.on("request:start", ({ request }) => {
    if (request.method === "PUT" && request.url.endsWith("/registration-options")) {
      void request
        .clone()
        .json()
        .then((body) =>
          sent.push({
            body: body as ReplaceRegistrationOptionsRequest,
            ifMatch: request.headers.get("If-Match"),
          }),
        );
    }
  });
  return sent;
}

test("shows every block closed, as the guest sees it, under the locked contact block", async () => {
  await renderEditor();

  const blocks = await screen.findAllByRole("listitem");
  expect(blocks[0]).toHaveAccessibleName("Coordonnées");
  expect(within(blocks[0]!).getByText("Toujours demandé")).toBeInTheDocument();
  // The guest's own input, with its price, and nothing to edit it with yet.
  expect(block("Repas adulte").getByText(/CHF 45/)).toBeInTheDocument();
  expect(block("Repas adulte").queryByLabelText("Intitulé")).not.toBeInTheDocument();
  expect(block("Dessert").getByText("Tiramisu")).toBeInTheDocument();
});

test("the strip carries the open switch, the closing date and the cap", async () => {
  await renderEditor();
  const strip = within(screen.getByRole("region", { name: "Réglages du formulaire" }));

  expect(strip.getByRole("switch", { name: "Réservations ouvertes" })).toBeChecked();
  expect(strip.getByLabelText("Clôture des inscriptions")).not.toHaveValue("");
  expect(strip.getByLabelText("Personnes par inscription")).toHaveValue("6");
});

test("tapping a block opens its settings in place, and tapping another closes it", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(screen.getByRole("button", { name: "Modifier «\u00a0Repas adulte\u00a0»" }));
  expect(block("Repas adulte").getByLabelText("Intitulé")).toHaveValue("Repas adulte");
  expect(block("Repas adulte").getByLabelText("Prix en francs")).toHaveValue("45");

  await user.click(screen.getByRole("button", { name: "Modifier «\u00a0Dessert\u00a0»" }));
  expect(block("Repas adulte").queryByLabelText("Intitulé")).not.toBeInTheDocument();
  expect(block("Dessert").getByLabelText("Réponse 2")).toHaveValue("Tiramisu");
});

test("an open block shows the edit in its guest view before the save", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(screen.getByRole("button", { name: "Modifier «\u00a0Repas adulte\u00a0»" }));
  await user.clear(block("Repas adulte").getByLabelText("Prix en francs"));
  await user.type(block("Repas adulte").getByLabelText("Prix en francs"), "50");

  expect(block("Repas adulte").getByText(/CHF 50/)).toBeInTheDocument();
});

test("the + between two blocks inserts the picked kind there, open", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(
    screen.getByRole("button", { name: "Ajouter un bloc après «\u00a0Repas adulte\u00a0»" }),
  );
  await user.click(screen.getByRole("button", { name: /^Oui \/ non/ }));
  await user.type(screen.getByLabelText("Intitulé"), "Vous venez en car ?");

  const names = screen.getAllByRole("listitem").map((item) => item.getAttribute("aria-label"));
  expect(names.slice(1, 4)).toEqual(["Repas adulte", "Vous venez en car ?", "Repas enfant"]);
});

test("one save sends the blocks in their new order with the form's settings", async () => {
  const user = userEvent.setup();
  const sent = capturePuts();
  await renderEditor();

  // The arrows are in the open block, as in the issue's mock-ups.
  await user.click(screen.getByRole("button", { name: "Modifier «\u00a0Repas adulte\u00a0»" }));
  await user.click(screen.getByRole("button", { name: "Descendre Repas adulte" }));
  await user.click(screen.getByRole("switch", { name: "Réservations ouvertes" }));
  await user.clear(screen.getByLabelText("Personnes par inscription"));
  await user.type(screen.getByLabelText("Personnes par inscription"), "8");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
  const [put] = sent;
  expect(put?.ifMatch).toMatch(/^"[0-9a-f]+"$/);
  expect(put?.body.options.slice(0, 2).map((option) => option.label)).toEqual([
    "Repas enfant",
    "Repas adulte",
  ]);
  expect(put?.body.form?.registrationEnabled).toBe(false);
  expect(put?.body.form?.registrationMaxGuests).toBe(8);
});

/**
 * The tag the write handed back, which covers the settings too.
 *
 * Mutation test: stop taking `etag` from the save's response and the second
 * save answers 412.
 */
test("can be saved twice without a reload", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.clear(screen.getByLabelText("Personnes par inscription"));
  await user.type(screen.getByLabelText("Personnes par inscription"), "7");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();

  await user.clear(screen.getByLabelText("Personnes par inscription"));
  await user.type(screen.getByLabelText("Personnes par inscription"), "5");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
  expect(screen.getByLabelText("Personnes par inscription")).toHaveValue("5");
});

test("a refused save keeps every edit and says why", async () => {
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/events/:id/registration-options", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Stale",
          status: 412,
          code: "if_match_failed",
          detail: null,
          instance: null,
          errors: [],
        },
        { status: 412, headers: { "Content-Type": "application/problem+json" } },
      ),
    ),
  );
  await renderEditor();

  await user.clear(screen.getByLabelText("Personnes par inscription"));
  await user.type(screen.getByLabelText("Personnes par inscription"), "9");
  await user.click(screen.getByRole("button", { name: "Ajouter un bloc ici" }));
  await user.click(screen.getByRole("button", { name: /^Texte libre/ }));
  await user.type(screen.getByLabelText("Intitulé"), "Remarques");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByLabelText("Personnes par inscription")).toHaveValue("9");
  expect(screen.getByRole("listitem", { name: "Remarques" })).toBeInTheDocument();
});

test("a block or an answer somebody booked cannot be removed", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(screen.getByRole("button", { name: "Modifier «\u00a0Repas adulte\u00a0»" }));
  expect(block("Repas adulte").queryByRole("button", { name: /^Retirer/ })).not.toBeInTheDocument();
  expect(block("Repas adulte").getByText(/A des réponses/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Modifier «\u00a0Dessert\u00a0»" }));
  // Meringue was picked; tiramisu was not.
  expect(
    block("Dessert").queryByRole("button", { name: "Retirer la réponse 1" }),
  ).not.toBeInTheDocument();
  expect(
    block("Dessert").getByRole("button", { name: "Retirer la réponse 2" }),
  ).toBeInTheDocument();
});

/**
 * A text box, so a desktop keyboard can type anything. `Number("10 pers.")`
 * is NaN, which JSON sends as null: no cap, saved without a word.
 */
test("a people cap that is not a whole number is refused before the save", async () => {
  const user = userEvent.setup();
  const sent = capturePuts();
  await renderEditor();

  await user.clear(screen.getByLabelText("Personnes par inscription"));
  await user.type(screen.getByLabelText("Personnes par inscription"), "10 pers.");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText(/nombre entier entre 1 et 100/)).toBeInTheDocument();
  expect(screen.queryByText("Enregistré.")).not.toBeInTheDocument();
  expect(sent).toHaveLength(0);
});

/**
 * The button that opens a block goes away as it opens, and "Terminé" as it
 * closes, so without this a keyboard or screen reader user lands on <body>.
 */
test("opening a block moves focus into it, and closing it moves focus back", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(screen.getByRole("button", { name: "Modifier «\u00a0Repas adulte\u00a0»" }));
  expect(block("Repas adulte").getByLabelText("Intitulé")).toHaveFocus();

  await user.click(block("Repas adulte").getByRole("button", { name: "Terminé" }));
  expect(screen.getByRole("button", { name: "Modifier «\u00a0Repas adulte\u00a0»" })).toHaveFocus();
});

/** The grip's drag, simulated as the browser fires it. */
test("dragging a block onto another puts it there", async () => {
  await renderEditor();
  const grip = (name: string) =>
    screen.getByRole("listitem", { name }).querySelector("[draggable=true]")!;
  const transfer = { setData: () => {}, setDragImage: () => {}, effectAllowed: "" };

  fireEvent.dragStart(grip("Sans repas"), { dataTransfer: transfer });
  fireEvent.dragOver(screen.getByRole("listitem", { name: "Repas adulte" }), {
    dataTransfer: transfer,
  });
  fireEvent.drop(screen.getByRole("listitem", { name: "Repas adulte" }), {
    dataTransfer: transfer,
  });

  const names = screen.getAllByRole("listitem").map((item) => item.getAttribute("aria-label"));
  expect(names.slice(1, 4)).toEqual(["Sans repas", "Repas adulte", "Repas enfant"]);
});

test("without a closing date the strip says nobody can book", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.clear(screen.getByLabelText("Clôture des inscriptions"));

  expect(screen.getByText(/Sans date de clôture, personne ne peut réserver/)).toBeInTheDocument();
});

test("an empty form copies another event's blocks, as new ones", async () => {
  const user = userEvent.setup();
  const sent = capturePuts();
  await renderEditor(REHEARSAL);

  await user.click(await screen.findByRole("button", { name: "Copier depuis…" }));
  await user.click(await screen.findByRole("button", { name: /^Souper de soutien/ }));

  expect(screen.getByRole("listitem", { name: "Repas adulte" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
  expect(sent[0]?.body.options.every((option) => option.id === null)).toBe(true);
  expect(
    sent[0]?.body.options
      .flatMap((option) => option.answers ?? [])
      .every((answer) => answer.id === null),
  ).toBe(true);
});

test("seeing it as a guest hides every editing control", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(screen.getByRole("button", { name: "Voir comme un invité" }));

  expect(screen.queryByRole("button", { name: /^Modifier «\u00a0/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Ajouter un bloc/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Réglages du formulaire" })).not.toBeInTheDocument();
  // The real input, to try out.
  expect(screen.getByRole("spinbutton", { name: /Repas adulte/ })).not.toHaveAttribute("inert");
});

test("leaving with unsaved edits asks first, and not after the save", async () => {
  const user = userEvent.setup();
  const asked: string[] = [];
  vi.spyOn(window, "confirm").mockImplementation((message?: string) => {
    asked.push(message ?? "");
    return false;
  });
  await renderEditor();

  await user.clear(screen.getByLabelText("Personnes par inscription"));
  await user.type(screen.getByLabelText("Personnes par inscription"), "4");
  await user.click(screen.getByRole("link", { name: "ailleurs" }));
  expect(asked).toHaveLength(1);
  expect(screen.queryByText("Ailleurs")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "ailleurs" }));
  expect(await screen.findByText("Ailleurs")).toBeInTheDocument();
  expect(asked).toHaveLength(1);
});
