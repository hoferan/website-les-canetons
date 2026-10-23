import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EventRegistrationOptions } from "./EventRegistrationOptions";

/** The seeded souper: three menus, then a heading, a yes/no, a choice and a text. */
const SOUPER = 7;

async function renderEditor(eventId = SOUPER) {
  setMockUser("demo.direction");
  const result = await renderWithSession(
    <Routes>
      <Route path="/events/:id/registration-options" element={<EventRegistrationOptions />} />
    </Routes>,
    { route: `/events/${eventId}/registration-options` },
  );
  await screen.findByRole("heading", { name: "Ce qu’on réserve" });
  return result;
}

/** The fields of one numbered block, which is how the screen names them. */
function row(position: number) {
  const heading = screen.getByRole("heading", { name: new RegExp(`^Bloc ${position} · `) });
  const item = heading.closest("li");

  if (!item) {
    throw new Error(`block ${position} is not in a list item`);
  }

  return within(item);
}

test("loads what the event offers, prices included", async () => {
  await renderEditor();

  await expect.poll(() => row(1).getByLabelText("Intitulé")).toHaveValue("Repas adulte");
  expect(row(1).getByLabelText("Prix en francs")).toHaveValue("45");
  expect(row(2).getByLabelText("Intitulé")).toHaveValue("Repas enfant");
});

/**
 * An option with no price comes back as an empty field, not "0": no price
 * stated is not the same as free, and the copy on the screen says so.
 */
test("an option with no price has an empty price field", async () => {
  await renderEditor();

  await expect.poll(() => row(3).getByLabelText("Intitulé")).toHaveValue("Sans repas");
  expect(row(3).getByLabelText("Prix en francs")).toHaveValue("");
  expect(screen.getByText(/écrivez 0 pour une option gratuite/)).toBeInTheDocument();
});

/**
 * The conditional write, on its own facet: the tag is the one
 * `GET /registration-options` handed out as the screen opened, not the
 * event's, because the options are absent from EventResource.
 *
 * Mutation test: drop `ifMatch(etag)` from the PUT and this fails with the
 * mocked backend's 428, as the real API would answer.
 */
test("saves quoting the tag the screen opened with", async () => {
  const user = userEvent.setup();
  let ifMatch: string | null = "not seen";

  server.use(
    http.put("/api/v1/events/:id/registration-options", ({ request }) => {
      ifMatch = request.headers.get("If-Match");
      return HttpResponse.json(
        { data: [], meta: { total: 0, limit: 500, offset: 0 } },
        { headers: { ETag: '"deadbeef"' } },
      );
    }),
  );

  await renderEditor();
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => ifMatch).not.toBe("not seen");
  expect(ifMatch).toMatch(/^"[0-9a-f]+"$/);
});

test("adds an option, and reads the saved list back", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(screen.getByRole("button", { name: "Quantité" }));
  await user.type(row(8).getByLabelText("Intitulé"), "Dessert supplémentaire");
  // A comma, which is what a French keyboard's numeric pad produces.
  await user.type(row(8).getByLabelText("Prix en francs"), "5,50");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
  // Re-seeded from the server's answer, so the comma comes back as the
  // canonical decimal point and the new row now carries a real id.
  expect(row(8).getByLabelText("Prix en francs")).toHaveValue("5.50");
});

/**
 * The tag the write handed back.
 *
 * Mutation test: stop re-seeding `etag` from the save's response and this
 * fails on the second save with 412.
 */
test("can be saved twice without a reload", async () => {
  const user = userEvent.setup();
  await renderEditor();

  // Both saves change something, or this test cannot fail: a save that
  // changes nothing does not move the entity tag.
  await user.clear(row(1).getByLabelText("Prix en francs"));
  await user.type(row(1).getByLabelText("Prix en francs"), "50");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();

  await user.clear(row(1).getByLabelText("Prix en francs"));
  await user.type(row(1).getByLabelText("Prix en francs"), "55");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
  expect(screen.queryByText(/Quelqu'un a modifié/)).not.toBeInTheDocument();
  expect(row(1).getByLabelText("Prix en francs")).toHaveValue("55");
});

/**
 * Icon-only, so the label is all a screen reader has. Each control is found
 * by the name that carries the option, and has no visible text.
 *
 * Mutation test: drop any one `aria-label` and its lookup fails.
 */
test("the reorder and remove controls are icons named for their option", async () => {
  await renderEditor();
  await expect.poll(() => row(1).getByLabelText("Intitulé")).toHaveValue("Repas adulte");

  for (const name of ["Monter Repas adulte", "Descendre Repas adulte", "Retirer Repas adulte"]) {
    const control = row(1).getByRole("button", { name });
    expect(control).toHaveTextContent(/^$/);
    expect(control.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  }
});

/**
 * Removing an option people have already booked would silently rewrite what
 * they ordered, so it is refused.
 */
test("refuses to drop an option somebody has booked, and keeps the edit", async () => {
  const user = userEvent.setup();
  await renderEditor();

  // "Sans repas" is the third option and Marc Python has booked it.
  await user.click(screen.getByRole("button", { name: "Retirer Sans repas" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(
    await screen.findByText(/Impossible de supprimer une option déjà réservée/),
  ).toBeInTheDocument();
  // The row stays removed: a refused save keeps the rest of the edit.
  expect(screen.queryByRole("heading", { name: "Bloc 7 · Texte libre" })).not.toBeInTheDocument();
});

/**
 * A price is parsed before anything is sent, so a malformed one lands on the
 * row it was typed in.
 */
test("reports a price that is not a price against its own row", async () => {
  const user = userEvent.setup();
  let sent = false;

  server.use(
    http.put("/api/v1/events/:id/registration-options", () => {
      sent = true;
      return HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } });
    }),
  );

  await renderEditor();
  await user.clear(row(2).getByLabelText("Prix en francs"));
  await user.type(row(2).getByLabelText("Prix en francs"), "vingt francs");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(
    await within(row(2).getByLabelText("Prix en francs").closest("div")!).findByText(
      /Indiquez un montant/,
    ),
  ).toBeInTheDocument();
  // Nothing left the browser.
  expect(sent).toBe(false);
  // And the other rows are clean.
  expect(row(1).queryByText(/Indiquez un montant/)).not.toBeInTheDocument();
});

test("reports a price that is not a price in German", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/events/:id/registration-options" element={<EventRegistrationOptions />} />
    </Routes>,
    { route: `/events/${SOUPER}/registration-options`, locale: "de-CH" },
  );
  const price = await screen.findAllByLabelText("Preis in Franken");

  await user.clear(price[1] as HTMLElement);
  await user.type(price[1] as HTMLElement, "zwanzig Franken");
  await user.click(screen.getByRole("button", { name: "Speichern" }));

  expect(
    await screen.findByText("Geben Sie einen Betrag ein, zum Beispiel 45 oder 45.50."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Indiquez un montant/)).toBeNull();
});

test("an event with nothing bookable says so and still offers the editor", async () => {
  // Event 1 is a rehearsal, which offers nothing.
  await renderEditor(1);

  expect(await screen.findByText(/Rien n’est proposé pour l’instant/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Quantité" })).toBeInTheDocument();
});

test("reorders the list, and the order is what is saved", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await expect.poll(() => row(1).getByLabelText("Intitulé")).toHaveValue("Repas adulte");
  await user.click(screen.getByRole("button", { name: "Descendre Repas adulte" }));

  expect(row(1).getByLabelText("Intitulé")).toHaveValue("Repas enfant");
  expect(row(2).getByLabelText("Intitulé")).toHaveValue("Repas adulte");

  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
  // Read back from the server, which sorted by the `sortOrder` this screen
  // sent as each row's position.
  expect(row(1).getByLabelText("Intitulé")).toHaveValue("Repas enfant");
});

test("shows each option's capacity, and how many places it has left", async () => {
  await renderEditor();

  await expect.poll(() => row(2).getByLabelText("Nombre de places")).toHaveValue("6");
  expect(row(2).getByLabelText("Nombre de places")).toHaveAccessibleDescription(
    /Il reste 3 places\./,
  );
  expect(row(1).getByLabelText("Nombre de places")).toHaveValue("");
});

test("saves a capacity, and an emptied one as no limit", async () => {
  const user = userEvent.setup();
  let sent: { capacity?: number | null }[] | null = null;

  server.use(
    http.put("/api/v1/events/:id/registration-options", async ({ request }) => {
      sent = ((await request.json()) as { options: { capacity?: number | null }[] }).options;
      return HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } });
    }),
  );

  await renderEditor();
  await user.type(row(1).getByLabelText("Nombre de places"), "120");
  await user.clear(row(2).getByLabelText("Nombre de places"));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => sent).not.toBeNull();
  // Only the quantities carry a capacity; the other blocks send none.
  expect(sent!.map((option) => option.capacity)).toEqual([
    120,
    null,
    null,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});

test("reports a capacity that is not a whole number of places against its own row", async () => {
  const user = userEvent.setup();
  let sent = false;

  server.use(
    http.put("/api/v1/events/:id/registration-options", () => {
      sent = true;
      return HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } });
    }),
  );

  await renderEditor();
  await user.type(row(1).getByLabelText("Nombre de places"), "0");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(
    await within(row(1).getByLabelText("Nombre de places").closest("div")!).findByText(
      /Indiquez un nombre entier/,
    ),
  ).toBeInTheDocument();
  expect(sent).toBe(false);
});

/** The body of the next PUT, with the server's answer left to the mock. */
function capturePut(): () => Record<string, unknown>[] | null {
  let sent: Record<string, unknown>[] | null = null;

  server.use(
    http.put("/api/v1/events/:id/registration-options", async ({ request }) => {
      sent = ((await request.json()) as { options: Record<string, unknown>[] }).options;
      return HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } });
    }),
  );

  return () => sent;
}

test("shows each saved block as its kind", async () => {
  await renderEditor();

  expect(await screen.findByRole("heading", { name: "Bloc 1 · Quantité" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Bloc 4 · Titre" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Bloc 5 · Oui / non" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Bloc 6 · Choix unique" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Bloc 7 · Texte libre" })).toBeInTheDocument();
  // Only a quantity has a price.
  expect(row(5).queryByLabelText("Prix en francs")).toBeNull();
  expect(row(6).getByLabelText("Réponse 1")).toHaveValue("Meringue et double crème");
});

test("adds one block of each kind and sends what each kind takes", async () => {
  const user = userEvent.setup();
  const sent = capturePut();
  await renderEditor(1);

  for (const kind of ["Quantité", "Texte libre", "Oui / non", "Titre", "Paragraphe"]) {
    await user.click(screen.getByRole("button", { name: kind }));
  }
  await user.type(row(1).getByLabelText("Intitulé"), "Pique-nique");
  await user.type(row(2).getByLabelText("Intitulé"), "Que nous apportez-vous ?");
  await user.click(row(2).getByRole("switch", { name: "Réponse obligatoire" }));
  await user.type(row(3).getByLabelText("Intitulé"), "Végétarien ?");
  await user.type(row(4).getByLabelText("Intitulé"), "Infos");
  await user.type(row(5).getByLabelText("Texte"), "Rendez-vous au local.");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await expect.poll(sent).not.toBeNull();
  expect(sent()).toEqual([
    expect.objectContaining({ kind: "quantity", label: "Pique-nique", countsGuests: true }),
    expect.objectContaining({ kind: "text", required: true }),
    expect.objectContaining({ kind: "yes_no", label: "Végétarien ?", required: false }),
    expect.objectContaining({ kind: "heading", label: "Infos" }),
    expect.objectContaining({ kind: "paragraph", description: "Rendez-vous au local." }),
  ]);
  // A text sends neither price nor capacity: the API refuses both off a quantity.
  expect(sent()![1]).not.toHaveProperty("priceCents");
  expect(sent()![1]).not.toHaveProperty("countsGuests");
});

test("a new quantity counts people until the committee says otherwise", async () => {
  const user = userEvent.setup();
  const sent = capturePut();
  await renderEditor(1);

  await user.click(screen.getByRole("button", { name: "Quantité" }));
  expect(row(1).getByRole("switch", { name: "Compte comme personnes" })).toBeChecked();

  await user.type(row(1).getByLabelText("Intitulé"), "Bouteilles");
  await user.click(row(1).getByRole("switch", { name: "Compte comme personnes" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await expect.poll(sent).not.toBeNull();
  expect(sent()![0]).toMatchObject({ kind: "quantity", countsGuests: false });
});

test("a choice keeps its answers' ids and sends new ones without", async () => {
  const user = userEvent.setup();
  const sent = capturePut();
  await renderEditor();

  await expect
    .poll(() => row(6).getByLabelText("Réponse 1"))
    .toHaveValue("Meringue et double crème");
  await user.click(row(6).getByRole("button", { name: "Ajouter une réponse" }));
  await user.type(row(6).getByLabelText("Réponse 3"), "Glace");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await expect.poll(sent).not.toBeNull();
  expect(sent()![5]).toMatchObject({
    kind: "choice",
    answers: [
      { id: "meringue", label: "Meringue et double crème" },
      { id: "tiramisu", label: "Tiramisu" },
      { id: null, label: "Glace" },
    ],
  });
});

test("a choice with one answer is reported before anything is sent", async () => {
  const user = userEvent.setup();
  const sent = capturePut();
  await renderEditor(1);

  await user.click(screen.getByRole("button", { name: "Choix unique" }));
  await user.type(row(1).getByLabelText("Intitulé"), "Taille");
  await user.type(row(1).getByLabelText("Réponse 1"), "M");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await row(1).findByText("Proposez au moins deux réponses.")).toBeInTheDocument();
  expect(sent()).toBeNull();
});

test("a locked block's refusal is shown in words", async () => {
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/events/:id/registration-options", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "locked",
          instance: "/api/v1/events/7/registration-options",
          code: "option_shape_locked",
          errors: [],
        },
        { status: 409 },
      ),
    ),
  );
  await renderEditor();

  await user.click(await screen.findByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText(/Quelqu'un a déjà répondu à ce bloc/)).toBeInTheDocument();
});
