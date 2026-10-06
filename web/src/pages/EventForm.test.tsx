import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, delay, http } from "msw";
import { expect, test } from "vitest";

import { eventIndex } from "../api/generated/endpoints";
import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Route, Routes } from "react-router-dom";

import { EventEdit } from "./EventEdit";
import { EventNew } from "./EventNew";

async function renderForm(locale: Locale = "fr") {
  setMockUser("demo.direction");
  const result = await renderWithSession(<EventNew />, { route: "/events/new", locale });
  await screen.findByLabelText(locale === "fr" ? "Titre" : "Titel");
  return result;
}

test("labels every field", async () => {
  await renderForm();
  expect(screen.getByLabelText("Titre")).toBeInTheDocument();
  expect(screen.getByLabelText("Date de début")).toBeInTheDocument();
  expect(screen.getByLabelText("Heure de début")).toBeInTheDocument();
  expect(screen.getByLabelText("Date de fin")).toBeInTheDocument();
  expect(screen.getByLabelText("Heure de fin")).toBeInTheDocument();
  expect(screen.getByLabelText("Lieu")).toBeInTheDocument();
});

test("the end date defaults to the start date as it is typed", async () => {
  // Almost every event is one day. Making the committee type the same date
  // twice, forty times a season, is the friction that stops a planning being
  // entered at all — and a two-day event is still one field away.
  await renderForm();
  await userEvent.type(screen.getByLabelText("Date de début"), "2026-09-05");

  expect(screen.getByLabelText("Date de fin")).toHaveValue("2026-09-05");
});

test("an end before the start is reported against its own field, in French", async () => {
  await renderForm();
  await userEvent.type(screen.getByLabelText("Titre"), "Répétition");
  await userEvent.type(screen.getByLabelText("Lieu"), "Werkhof");
  await userEvent.type(screen.getByLabelText("Date de début"), "2026-09-05");
  await userEvent.type(screen.getByLabelText("Heure de début"), "12:00");
  await userEvent.clear(screen.getByLabelText("Heure de fin"));
  await userEvent.type(screen.getByLabelText("Heure de fin"), "10:00");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  expect(await screen.findByText(/Fin .*après/)).toBeInTheDocument();
  // The form stays open so the wrong field can be corrected where it was typed.
  expect(screen.getByLabelText("Titre")).toHaveValue("Répétition");
});

test("shows the submit as busy without disabling it", async () => {
  await renderForm();
  // Never the disabled attribute: disabling the focused control blurs it to
  // <body> and throws focus away mid-submit.
  const submit = screen.getByRole("button", { name: "Enregistrer le brouillon" });
  expect(submit).not.toBeDisabled();
});

/* ---------------------------------------------------------------------------
 * The registration window
 * -------------------------------------------------------------------------- */

test("offers the registration window, and says which field is the switch", async () => {
  // THE CONTROL, not the label in fr.ts. `registrationClosesAt` had a French
  // label from the day the registration API shipped and no input rendering
  // it — the same shape as `instructor_of_section_id`, which sat in a draft, was sent
  // on every write, and could only ever be null.
  await renderForm();

  expect(screen.getByLabelText("Clôture des inscriptions")).toBeInTheDocument();
  expect(screen.getByLabelText("Heure de clôture")).toBeInTheDocument();
  expect(screen.getByLabelText("Ouverture des inscriptions")).toBeInTheDocument();
  expect(screen.getByLabelText("Heure d’ouverture")).toBeInTheDocument();
  expect(screen.getByLabelText("Personnes par inscription")).toBeInTheDocument();

  // A date field is not self-evidently a switch, so the copy beside it is
  // load-bearing rather than decorative.
  expect(
    screen.getByText(/date de clôture pour ouvrir cet événement aux inscriptions/),
  ).toBeInTheDocument();
});

/**
 * An event the form has just created, read back out of the mocked backend.
 *
 * Through the API rather than off the screen, because what these two tests are
 * about is the BODY the form sends: `registrationClosesAt` and the flag
 * derived from it are not rendered on a card, so a screen assertion could not
 * tell a null from an instant.
 */
async function createdEvent(title: string) {
  const planning = await eventIndex({ limit: 1000 });
  const rows = planning.status === 200 ? planning.data.data : [];
  const created = rows.find((event) => event.title === title);

  if (!created) {
    throw new Error(`no event titled "${title}" was created`);
  }

  return created;
}

async function fillIn(fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) {
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    await userEvent.type(field, value);
  }
}

test("a new event takes no bookings until a closing date is typed", async () => {
  // MUTATION TEST: make eventBodyFrom compose the closing instant
  // unconditionally and this fails — every rehearsal in the planning would
  // open itself to the public.
  await renderForm();

  await fillIn({
    Titre: "Répétition de novembre",
    Lieu: "Werkhof",
    "Date de début": "2026-11-07",
    "Heure de début": "10:00",
    "Heure de fin": "12:00",
  });
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  const created = await createdEvent("Répétition de novembre");
  expect(created.registrationClosesAt).toBeNull();
  expect(created.takesRegistrations).toBe(false);
});

test("typing a closing date is what opens an event to the public", async () => {
  await renderForm();

  await fillIn({
    Titre: "Souper de novembre",
    Lieu: "Grenette",
    "Date de début": "2026-11-21",
    "Heure de début": "18:30",
    "Heure de fin": "23:30",
    "Clôture des inscriptions": "2026-11-14",
  });
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  const created = await createdEvent("Souper de novembre");
  // November, so +01:00 — the season runs through both offsets, which is why
  // bandTime exists at all. 23:59 is the default beside the date field, so a
  // closing DAY means the whole of it.
  expect(created.registrationClosesAt).toBe("2026-11-14T23:59:00+01:00");
  expect(created.takesRegistrations).toBe(true);
});

test("an empty guest cap is no cap, not a cap of zero", async () => {
  // MUTATION TEST: pass the field through `Number()` unguarded and this fails.
  // `Number("")` is 0, and an event nobody may book is not an event with no
  // limit.
  await renderForm();

  await fillIn({
    Titre: "Loto de novembre",
    Lieu: "Grenette",
    "Date de début": "2026-11-28",
    "Heure de début": "19:00",
    "Heure de fin": "22:00",
    "Clôture des inscriptions": "2026-11-21",
  });
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  expect((await createdEvent("Loto de novembre")).registrationMaxGuests).toBeNull();
});

/* ---------------------------------------------------------------------------
 * The form in German (#166)
 * -------------------------------------------------------------------------- */

test("every control is German", async () => {
  await renderForm("de-CH");

  expect(screen.getByLabelText("Titel")).toBeInTheDocument();
  expect(screen.getByLabelText("Startdatum")).toBeInTheDocument();
  expect(screen.getByLabelText("Startzeit")).toBeInTheDocument();
  expect(screen.getByLabelText("Enddatum")).toBeInTheDocument();
  expect(screen.getByLabelText("Endzeit")).toBeInTheDocument();
  expect(screen.getByLabelText("Ort")).toBeInTheDocument();
  expect(screen.getByLabelText("Kleidung")).toBeInTheDocument();
  expect(screen.getByLabelText("Bemerkungen")).toBeInTheDocument();
  expect(screen.getByLabelText("Anmeldeschluss")).toBeInTheDocument();
  expect(screen.getByLabelText("Personen pro Anmeldung")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Entwurf speichern" })).toBeInTheDocument();
});

test("A CONTROL'S LABEL IS NOT THE FIELD'S NOUN, which is why they are separate keys", async () => {
  // THE TEST #166 EXISTS TO SETTLE. The box is labelled "Endzeit", and the
  // refusal under it names the API field `endsAt`, whose noun is "Ende":
  //
  //     Endzeit  [ 10:00 ]
  //     Ende muss nach dem Beginn liegen
  //
  // One instant is edited by two boxes, so the control cannot be called by
  // the field's name without lying about which box it is; and the message
  // must name the thing, not the box, or it reads "Endzeit muss nach dem
  // Beginn liegen" — which is about a time-of-day input rather than about the
  // end of the event.
  //
  // The French half of this is four tests above and is UNCHANGED: it asserts
  // /Fin .*après/ against a box labelled "Heure de fin". Both languages, same
  // split.
  //
  // MUTATION TEST: point EventForm's labels at fields.* and this still passes
  // — but "Endzeit" disappears from the screen and the test above fails,
  // because the box would then be called "Ende".
  await renderForm("de-CH");

  await userEvent.type(screen.getByLabelText("Titel"), "Probe");
  await userEvent.type(screen.getByLabelText("Ort"), "Werkhof");
  await userEvent.type(screen.getByLabelText("Startdatum"), "2026-09-05");
  await userEvent.type(screen.getByLabelText("Startzeit"), "12:00");
  await userEvent.clear(screen.getByLabelText("Endzeit"));
  await userEvent.type(screen.getByLabelText("Endzeit"), "10:00");
  await userEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));

  expect(await screen.findByText("Ende muss nach dem Beginn liegen")).toBeInTheDocument();
  expect(screen.getByLabelText("Endzeit")).toBeInTheDocument();
});

test("the attire hint quotes the card's own words, in both languages", async () => {
  // THE HINT AND THE CARD MUST NOT DISAGREE about what an empty field looks
  // like, so the quoted words are events.card.attireUnset rather than a second
  // copy typed into this sentence. The guillemets travel with it: French
  // spaces them, German sets them tight.
  await renderForm();
  expect(screen.getByText(/la carte affichera « Non précisée »/)).toBeInTheDocument();

  await renderForm("de-CH");
  expect(screen.getByText(/Die Karte zeigt dann «Nicht festgelegt»/)).toBeInTheDocument();
});

/* -------------------------------------------------------------------------- *
 * Draft and publish
 * -------------------------------------------------------------------------- */

async function renderCreateAndEdit() {
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/events/new" element={<EventNew />} />
      <Route path="/events/:id/edit" element={<EventEdit />} />
      <Route path="/events" element={<p>planning</p>} />
    </Routes>,
    { route: "/events/new" },
  );
  await screen.findByLabelText("Titre");
}

async function renderEdit(id: number) {
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/events/:id/edit" element={<EventEdit />} />
      <Route path="/events" element={<p>planning</p>} />
    </Routes>,
    { route: `/events/${id}/edit` },
  );
  await screen.findByLabelText("Titre");
}

test("a new event is a draft, and saving it needs nothing but a title", async () => {
  await renderCreateAndEdit();
  await userEvent.type(screen.getByLabelText("Titre"), "Lieu à confirmer");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  await screen.findByText("planning");
  const created = await createdEvent("Lieu à confirmer");
  expect(created.publishedAt).toBeNull();
  expect(created.startsAt).toBeNull();
  expect(created.location).toBeNull();
});

test("a new event offers the two actions separately", async () => {
  await renderCreateAndEdit();

  expect(screen.getByRole("button", { name: "Enregistrer le brouillon" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publier" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Enregistrer" })).not.toBeInTheDocument();
});

test("publishing an incomplete form keeps the draft and names what is missing", async () => {
  await renderCreateAndEdit();
  await userEvent.type(screen.getByLabelText("Titre"), "Sortie à définir");
  await userEvent.click(screen.getByRole("button", { name: "Publier" }));

  // Sent to the saved draft's own edit screen, with the refusal carried along
  // and the form filled from what was saved. Staying on the create screen
  // would offer a second save that makes a second event.
  expect(
    await screen.findByText("Complétez ou corrigez les champs avant de publier."),
  ).toBeInTheDocument();
  expect(screen.getByText("Début est obligatoire")).toBeInTheDocument();
  expect(screen.getByText("Lieu est obligatoire")).toBeInTheDocument();
  expect(screen.getByLabelText("Titre")).toHaveValue("Sortie à définir");

  const saved = await createdEvent("Sortie à définir");
  expect(saved.publishedAt).toBeNull();
});

test("publishing a complete form saves and publishes in one go", async () => {
  await renderCreateAndEdit();
  await fillIn({
    Titre: "Concert de printemps",
    Lieu: "Halle des fêtes",
    "Date de début": "2027-03-13",
    "Heure de début": "17:00",
    "Heure de fin": "19:00",
  });
  await userEvent.click(screen.getByRole("button", { name: "Publier" }));

  await screen.findByText("planning");
  const created = await createdEvent("Concert de printemps");
  expect(created.publishedAt).not.toBeNull();
});

test("editing a draft offers both actions and lets the date go", async () => {
  await renderEdit(8);

  expect(screen.getByRole("button", { name: "Enregistrer le brouillon" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publier" })).toBeInTheDocument();

  // A start needs both halves, or neither: while the time is filled in, the
  // date is required, and clearing the pair is what lets the date go.
  await userEvent.clear(screen.getByLabelText("Date de début"));
  await userEvent.clear(screen.getByLabelText("Heure de début"));
  expect(screen.getByLabelText("Date de début")).not.toBeRequired();
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  await screen.findByText("planning");
  await waitFor(async () => expect((await createdEvent("Concert d'automne")).startsAt).toBeNull());
});

test("a new event is saved with the tags picked for it", async () => {
  await renderCreateAndEdit();
  await userEvent.type(screen.getByLabelText("Titre"), "Répétition générale");
  const picker = await screen.findByRole("group", { name: "Catégories" });
  await userEvent.click(within(picker).getByRole("button", { name: "Répétition" }));
  expect(within(picker).getByRole("button", { name: "Répétition" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  await screen.findByText("planning");
  const created = await createdEvent("Répétition générale");
  expect(created.tags.map((tag) => tag.labelFr)).toEqual(["Répétition"]);
});

test("editing an event adds one tag and takes another off", async () => {
  // Event 8, "Concert d'automne", carries Concert in the seed.
  await renderEdit(8);
  const picker = await screen.findByRole("group", { name: "Catégories" });
  expect(within(picker).getByRole("button", { name: "Concert" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await userEvent.click(within(picker).getByRole("button", { name: "Concert" }));
  await userEvent.click(within(picker).getByRole("button", { name: "Sortie" }));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  await screen.findByText("planning");
  await waitFor(async () =>
    expect((await createdEvent("Concert d'automne")).tags.map((tag) => tag.labelFr)).toEqual([
      "Sortie",
    ]),
  );
});

test("a published event's form still requires its date and place", async () => {
  await renderEdit(3);

  expect(screen.getByLabelText("Date de début")).toBeRequired();
  expect(screen.getByLabelText("Lieu")).toBeRequired();
  expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Publier" })).not.toBeInTheDocument();
});

test("the form stays busy from the create through the publish, so a second tap makes no second event", async () => {
  // The create finishes before the publish starts. The form used to be busy
  // only for the create, so a tap in the gap saved a second event. The publish
  // is held open here so that the gap can be looked at.
  server.use(
    http.post("/api/v1/events/:id/publish", async () => {
      await delay(400);
      return HttpResponse.json({});
    }),
  );
  await renderCreateAndEdit();
  await fillIn({
    Titre: "Un seul concert",
    Lieu: "Halle des fêtes",
    "Date de début": "2027-04-10",
    "Heure de début": "17:00",
    "Heure de fin": "19:00",
  });

  const publish = screen.getByRole("button", { name: "Publier" });
  await userEvent.click(publish);

  // The create is done once the event exists; the publish is still in flight.
  await waitFor(async () => expect((await createdEvent("Un seul concert")).id).toBeGreaterThan(0));
  expect(publish).toHaveAttribute("aria-disabled", "true");

  await userEvent.click(publish);
  await screen.findByText("planning");

  const planning = await eventIndex({ limit: 1000 });
  const rows = planning.status === 200 ? planning.data.data : [];
  expect(rows.filter((event) => event.title === "Un seul concert")).toHaveLength(1);
});
