import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { EventSeriesNew } from "./EventSeriesNew";

async function renderGenerator(locale: Locale = "fr") {
  setMockUser("demo.direction");
  const result = await renderWithSession(<EventSeriesNew />, {
    route: "/events/new/series",
    locale,
  });
  await screen.findByLabelText(locale === "fr" ? "Titre" : "Titel");
  return result;
}

/** Four Saturdays in September 2026, which is a real slice of the season. */
async function fillSeptember(locale: Locale = "fr") {
  const label =
    locale === "fr"
      ? { title: "Titre", location: "Lieu", from: "Du", to: "Au" }
      : { title: "Titel", location: "Ort", from: "Von", to: "Bis" };

  await userEvent.type(screen.getByLabelText(label.title), "Répétition");
  await userEvent.type(screen.getByLabelText(label.location), "Werkhof");
  await userEvent.type(screen.getByLabelText(label.from), "2026-09-05");
  await userEvent.type(screen.getByLabelText(label.to), "2026-09-26");
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

/* ---------------------------------------------------------------------------
 * The generator in German (#166)
 * -------------------------------------------------------------------------- */

test("the preview date is fr-CH in French — pinned, because the formatter moved", async () => {
  // NO FRENCH ASSERTION PINNED THIS UNTIL NOW, and PREVIEW_DATE stopped being
  // a module-scope constant in this slice. `intlTag(locale, "long")` would
  // have handed back `fr-FR`, which drops the comma after the weekday; the
  // formatter asks for "short" precisely to keep the `fr-CH` it always had.
  // Without this line that regression would have been invisible.
  await renderGenerator();
  await fillSeptember();

  const preview = await screen.findByTestId("series-preview");
  expect(within(preview).getByText("samedi, 5 septembre 2026")).toBeInTheDocument();
});

test("the generator, its weekdays and its preview dates are German", async () => {
  await renderGenerator("de-CH");
  await fillSeptember("de-CH");

  // THE WEEKDAY SELECT WAS A MODULE-SCOPE ARRAY OF FRENCH LABELS — `label`,
  // not `labelKey`, the one rule Layout.tsx's NAV follows and this file did
  // not. Frozen at import, it read "Samedi" on a German page forever.
  const weekdays = screen.getByLabelText("Wochentag");
  expect(within(weekdays).getByRole("option", { name: "Samstag" })).toBeInTheDocument();
  expect(within(weekdays).queryByRole("option", { name: "Samedi" })).toBeNull();

  const preview = await screen.findByTestId("series-preview");
  expect(within(preview).getByText("Samstag, 5. September 2026")).toBeInTheDocument();

  // A <legend>, so it names a group rather than a control.
  expect(screen.getByRole("group", { name: "Zu erstellende Termine" })).toBeInTheDocument();
});

test("the create button counts in German, singular and plural", async () => {
  await renderGenerator("de-CH");
  await fillSeptember("de-CH");

  expect(await screen.findByRole("button", { name: "4 Anlässe erstellen" })).toBeInTheDocument();

  // Down to one, which is the form i18next has to pick rather than the
  // component.
  const preview = screen.getByTestId("series-preview");
  for (const box of within(preview).getAllByRole("checkbox").slice(1)) {
    await userEvent.click(box);
  }

  expect(await screen.findByRole("button", { name: "1 Anlass erstellen" })).toBeInTheDocument();
});

test("the success panel counts in German", async () => {
  await renderGenerator("de-CH");
  await fillSeptember("de-CH");
  await userEvent.click(await screen.findByRole("button", { name: "4 Anlässe erstellen" }));

  expect(await screen.findByRole("status")).toHaveTextContent("4 Anlässe erstellt.");
  expect(screen.getByRole("button", { name: "Weitere Serie erstellen" })).toBeInTheDocument();
});
