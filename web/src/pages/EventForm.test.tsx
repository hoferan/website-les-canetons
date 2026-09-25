import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { eventIndex } from "../api/generated/endpoints";
import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
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
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText(/Fin .*après/)).toBeInTheDocument();
  // The form stays open so the wrong field can be corrected where it was typed.
  expect(screen.getByLabelText("Titre")).toHaveValue("Répétition");
});

test("shows the submit as busy without disabling it", async () => {
  await renderForm();
  // Never the disabled attribute: disabling the focused control blurs it to
  // <body> and throws focus away mid-submit.
  const submit = screen.getByRole("button", { name: "Enregistrer" });
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
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

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
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

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
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

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
  expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
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
  await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

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
