import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { eventIndex } from "../api/generated/endpoints";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { EventNew } from "./EventNew";

async function renderForm() {
  setMockUser("demo.direction");
  const result = await renderWithSession(<EventNew />, { route: "/events/new" });
  await screen.findByLabelText("Titre");
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
 * The registration window (R3)
 * -------------------------------------------------------------------------- */

test("offers the registration window, and says which field is the switch", async () => {
  // THE CONTROL, not the label in fr.ts. `registrationClosesAt` has had a
  // French label since R3's API half shipped and no input rendering it — the
  // same shape as `instructor_of_section_id`, which sat in a draft, was sent
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
