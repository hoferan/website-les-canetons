import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes, useLocation } from "react-router-dom";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EventSeriesNew } from "./EventSeriesNew";
import { Events } from "./Events";

/** Where the router is, so a test can see a navigation the way a reader does. */
function WhereAmI() {
  const location = useLocation();
  return (
    <>
      <p data-testid="pathname">{location.pathname}</p>
      <p data-testid="history-state">{JSON.stringify(location.state ?? null)}</p>
    </>
  );
}

async function renderGenerator(locale: Locale = "fr") {
  setMockUser("demo.direction");
  const result = await renderWithSession(
    <>
      <Routes>
        <Route path="/events/new/series" element={<EventSeriesNew />} />
        <Route path="/events" element={<Events />} />
      </Routes>
      <WhereAmI />
    </>,
    { route: "/events/new/series", locale },
  );
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

/**
 * THE URL SAYS IT WORKED (#103). The generator used to report the count in
 * place, on the form's own path, and a check that read the URL concluded the
 * save had failed and ran it again: two identical seasons on TEST, cleaned up
 * by id. Landing on the planning puts the reader where the new rehearsals are.
 *
 * The count is then cleared from the history entry, or a reload would report
 * the same season as created again. MUTATION TEST: drop the replacing
 * navigate() in SeriesCreatedNotice and the last assertion fails.
 */
test("creating a season goes to the planning and says how many were created", async () => {
  await renderGenerator();
  await fillSeptember();
  await userEvent.click(await screen.findByRole("button", { name: "Créer 4 événements" }));

  expect(await screen.findByRole("status")).toHaveTextContent("4 événements créés.");
  expect(screen.getByTestId("pathname")).toHaveTextContent(/^\/events$/);
  expect(screen.getByRole("link", { name: "Créer une autre série" })).toHaveAttribute(
    "href",
    "/events/new/series",
  );
  await expect.poll(() => screen.getByTestId("history-state").textContent).toBe("null");
});

test("the count on the planning goes away when dismissed", async () => {
  await renderGenerator();
  await fillSeptember();
  await userEvent.click(await screen.findByRole("button", { name: "Créer 4 événements" }));
  await screen.findByRole("status");

  await userEvent.click(screen.getByRole("button", { name: "Fermer ce message" }));

  expect(screen.queryByText("4 événements créés.")).toBeNull();
});

/**
 * PRESENT BUT INERT before there is anything to create (#103). The page used
 * to open with "Annuler" as its only action, which reads as a broken form.
 * The button is there from the start and points at the line saying what it
 * still needs.
 *
 * MUTATION TEST: go back to rendering the button only once a date is chosen
 * and this lookup fails.
 */
test("before a range is chosen, the button is there, inert, and says why", async () => {
  await renderGenerator();

  const button = screen.getByRole("button", { name: "Créer les événements" });
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).toHaveAccessibleDescription(
    "Choisissez un jour et une période pour voir les dates qui seront créées.",
  );
});

/**
 * THE ONE STATE WHERE ONLY onSubmit's EARLY RETURN STOPS THE POST. Every
 * field is filled, so the browser's own checks pass, and nothing is chosen.
 * MUTATION TEST: drop `chosen.length === 0` from that return and a request
 * for zero events is sent.
 */
test("with every date unticked, the button says to tick one and sends nothing", async () => {
  let posted = false;
  server.use(
    http.post("/api/v1/events/series", () => {
      posted = true;
      return HttpResponse.json({}, { status: 500 });
    }),
  );
  await renderGenerator();
  await fillSeptember();

  const preview = await screen.findByTestId("series-preview");
  for (const box of within(preview).getAllByRole("checkbox")) {
    await userEvent.click(box);
  }

  const button = screen.getByRole("button", { name: "Créer les événements" });
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).toHaveAccessibleDescription("Cochez au moins une date.");

  await userEvent.click(button);
  expect(posted).toBe(false);
});

test("changing the range unticks nothing and re-ticks everything", async () => {
  // A tick state that survived a new range would be applied to whichever dates
  // happen to sit at those positions now, and the season would be quietly
  // missing a rehearsal nobody chose to skip.
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
  // NO FRENCH ASSERTION PINNED THIS UNTIL #166, and PREVIEW_DATE stopped being
  // a module-scope constant in that slice. The risk then was intlTag's `long`
  // kind, which handed back `fr-FR` and drops the comma after the weekday.
  // That kind is gone (#161) and intlTag now returns `fr-CH` for French with
  // nothing to choose — so this assertion is no longer guarding a choice, it
  // is guarding the comma itself, which is what a reader sees.
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

test("the count on the planning is German", async () => {
  await renderGenerator("de-CH");
  await fillSeptember("de-CH");
  await userEvent.click(await screen.findByRole("button", { name: "4 Anlässe erstellen" }));

  expect(await screen.findByRole("status")).toHaveTextContent("4 Anlässe erstellt.");
  expect(screen.getByRole("link", { name: "Weitere Serie erstellen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Meldung schliessen" })).toBeInTheDocument();
});

test("the inert button and its reason are German", async () => {
  await renderGenerator("de-CH");

  expect(screen.getByRole("button", { name: "Anlässe erstellen" })).toHaveAccessibleDescription(
    "Wählen Sie einen Tag und einen Zeitraum, um die Termine zu sehen, die erstellt werden.",
  );
});
