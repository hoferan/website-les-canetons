import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

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
