import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { EventSeriesNew } from "./EventSeriesNew";

async function renderGenerator() {
  setMockUser("demo.direction");
  const result = await renderWithSession(<EventSeriesNew />, { route: "/events/new/series" });
  await screen.findByLabelText("Titre");
  return result;
}

async function fillSeptember() {
  await userEvent.type(screen.getByLabelText("Titre"), "Répétition");
  await userEvent.type(screen.getByLabelText("Lieu"), "Werkhof");
  await userEvent.type(screen.getByLabelText("Du"), "2026-09-05");
  await userEvent.type(screen.getByLabelText("Au"), "2026-09-26");
}

test("previews every generated date before anything is created", async () => {
  await renderGenerator();
  await fillSeptember();

  const preview = await screen.findByTestId("series-preview");
  expect(within(preview).getAllByRole("checkbox")).toHaveLength(4);
});

test("every date starts ticked, because the common case is all of them", async () => {
  await renderGenerator();
  await fillSeptember();

  const preview = await screen.findByTestId("series-preview");
  within(preview)
    .getAllByRole("checkbox")
    .forEach((box) => expect(box).toBeChecked());
});

test("unticking a holiday removes it from what gets created", async () => {
  // The real planning skips four Saturdays for school holidays. This is the
  // whole reason the preview exists rather than a straight generate.
  await renderGenerator();
  await fillSeptember();

  const preview = await screen.findByTestId("series-preview");
  const boxes = within(preview).getAllByRole("checkbox");
  await userEvent.click(boxes[1] as HTMLElement);

  expect(screen.getByRole("button", { name: "Créer 3 événements" })).toBeInTheDocument();
});

test("the button counts what will actually be created", async () => {
  await renderGenerator();
  await fillSeptember();

  expect(await screen.findByRole("button", { name: "Créer 4 événements" })).toBeInTheDocument();
});

test("creating a season lands them all in the planning", async () => {
  await renderGenerator();
  await fillSeptember();
  await userEvent.click(await screen.findByRole("button", { name: "Créer 4 événements" }));

  expect(await screen.findByText(/4 événements créés/)).toBeInTheDocument();
});

test("nothing is offered to create before a range is chosen", async () => {
  await renderGenerator();
  expect(screen.queryByRole("button", { name: /Créer/ })).toBeNull();
});

test("changing the range unticks nothing and re-ticks everything", async () => {
  // A tick state that survived a new range would be applied to whichever dates
  // happen to sit at those positions now, and the season would be quietly
  // missing a rehearsal nobody chose to skip. This is the requirement the plan
  // states and does not test.
  await renderGenerator();
  await fillSeptember();

  const preview = await screen.findByTestId("series-preview");
  await userEvent.click(within(preview).getAllByRole("checkbox")[1] as HTMLElement);
  expect(screen.getByRole("button", { name: "Créer 3 événements" })).toBeInTheDocument();

  await userEvent.clear(screen.getByLabelText("Au"));
  await userEvent.type(screen.getByLabelText("Au"), "2026-10-03");

  expect(await screen.findByRole("button", { name: "Créer 5 événements" })).toBeInTheDocument();
});
