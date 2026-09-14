import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EventRegistrationOptions } from "./EventRegistrationOptions";

/** The seeded souper, which offers three things. */
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

/** The fields of one numbered row, which is how the screen names them. */
function row(position: number) {
  const heading = screen.getByRole("heading", { name: `Option ${position}` });
  const item = heading.closest("li");

  if (!item) {
    throw new Error(`option ${position} is not in a list item`);
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
 * An option with no price at all comes back as an EMPTY field, not "0".
 *
 * The two are different answers — no price stated, against free — and the
 * copy on the screen says so, because a committee member typing 0 into an
 * empty field would be making a claim about money.
 */
test("an option with no price has an empty price field", async () => {
  await renderEditor();

  await expect.poll(() => row(3).getByLabelText("Intitulé")).toHaveValue("Sans repas");
  expect(row(3).getByLabelText("Prix en francs")).toHaveValue("");
  expect(screen.getByText(/écrivez 0 pour une option gratuite/)).toBeInTheDocument();
});

/**
 * THE CONDITIONAL WRITE, on its OWN facet.
 *
 * MUTATION TEST: drop `ifMatch(etag)` from the PUT and this fails with the
 * mocked backend's 428, exactly as the real API would answer. The tag is the
 * one `GET /registration-options` handed out as the screen opened — a
 * different facet from the event's, because the options are absent from
 * EventResource and a tag over the event would neither move when an option
 * changed nor survive a correction to the dress code.
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

  await user.click(screen.getByRole("button", { name: "Ajouter une option" }));
  await user.type(row(4).getByLabelText("Intitulé"), "Dessert supplémentaire");
  // A COMMA, which is what a French keyboard's numeric pad produces. Refusing
  // it would be correct and useless.
  await user.type(row(4).getByLabelText("Prix en francs"), "5,50");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Enregistré.")).toBeInTheDocument();
  // Re-seeded from the server's answer, so the comma comes back as the
  // canonical decimal point and the new row now carries a real id.
  expect(row(4).getByLabelText("Prix en francs")).toHaveValue("5.50");
});

/**
 * THE TAG THE WRITE HANDED BACK.
 *
 * MUTATION TEST: stop re-seeding `etag` from the save's response and this
 * fails on the second save with 412 — which on screen reads as somebody else
 * editing, when it was this screen a second ago.
 */
test("can be saved twice without a reload", async () => {
  const user = userEvent.setup();
  await renderEditor();

  // BOTH SAVES CHANGE SOMETHING, and that is what makes this test able to
  // fail. The first draft saved the list unaltered twice — and a save that
  // changes nothing does not move the entity tag, so a screen that never
  // re-seeded its tag passed anyway. The mutation survived until the two
  // edits below were added.
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
 * The invariant the whole replace-all shape exists for: removing an option
 * people have already booked would silently rewrite what those people
 * ordered, so it is refused instead.
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
  // The row stays removed: a refused save must not throw away the rest of the
  // edit either.
  expect(screen.queryByRole("heading", { name: "Option 3" })).not.toBeInTheDocument();
});

/**
 * A price is parsed BEFORE anything is sent, so a malformed one lands on the
 * row it was typed in. The API would refuse it against `options.2.priceCents`,
 * a path the committee cannot map back to a row on screen.
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
  // Nothing left the browser: the rest of the list is not saved under a
  // half-valid edit.
  expect(sent).toBe(false);
  // And the other rows are clean, which is the half a bare `messageFor` would
  // get wrong.
  expect(row(1).queryByText(/Indiquez un montant/)).not.toBeInTheDocument();
});

test("an event with nothing bookable says so and still offers the editor", async () => {
  // Event 1 is a rehearsal, which offers nothing.
  await renderEditor(1);

  expect(await screen.findByText(/Rien n’est proposé pour l’instant/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ajouter une option" })).toBeInTheDocument();
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
