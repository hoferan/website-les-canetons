import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { formatEventDate, formatEventDateRange } from "../lib/date";
import { SEED } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { PlanningRepet } from "./PlanningRepet";

// By title rather than by index: Task 6 adds a past event at the START of SEED,
// and an index here would then point at the wrong event while still type-checking.
const CONCERT = SEED.find((event) => event.title === "Concert d'automne")!;
const WEEKEND = SEED.find((event) => event.title === "Week-end de répétition")!;

test("the events are listed in the order the API returned them", async () => {
  await renderWithSession(<PlanningRepet />);

  const items = within(await screen.findByRole("list", { name: "Événements" })).getAllByRole(
    "listitem",
  );
  expect(items).toHaveLength(3);

  // Pins the order. The page does not re-sort, so a change in the API's
  // ordering must fail here rather than be silently corrected in the UI.
  //
  // Asserted on textContent rather than getByText: each line is split across a
  // <strong> label and a text node, and getByText matches per element, so a
  // query for "Titre : X" finds nothing even though the line reads that way.
  // "Titre :" is gone — the line is obviously the title, and on a phone five
  // label-value lines were mostly label. The titles themselves still pin the
  // order, which is what this test is for.
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining("Concert d'automne"),
    expect.stringContaining("Assemblée générale"),
    expect.stringContaining("Week-end de répétition"),
  ]);
});

test("an event shows its date, times, location and attire", async () => {
  await renderWithSession(<PlanningRepet />);

  const first = within(await screen.findByRole("list", { name: "Événements" })).getAllByRole(
    "listitem",
  )[0]!;
  // The DATE is asserted through the app's own formatter rather than as a
  // literal, because the fixture's dates are now offsets from today. That is
  // not a weaker assertion than it looks: the French formatting itself is
  // pinned on FIXED dates in web/src/lib/date.test.ts, which is where
  // formatting belongs. This test's job is that the card shows the event's
  // date at all.
  expect(within(first).getByText(formatEventDate(CONCERT.date))).toBeInTheDocument();
  // One meta line now: the two "Heure de …" labels and "Lieu :" were three
  // lines of mostly label on a phone. "Tenue :" KEEPS its label — it is the
  // detail members scan for and the one they get wrong.
  expect(first).toHaveTextContent("19:00 – 22:00");
  expect(first).toHaveTextContent("Salle communale");
  expect(first).toHaveTextContent("Tenue : Costume des canetons");
});

test("a weekend event shows a date range instead of one day", async () => {
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findByText(formatEventDateRange(WEEKEND.date))).toBeInTheDocument();
});

test("an event with no attire omits the Tenue line entirely", async () => {
  await renderWithSession(<PlanningRepet />);
  const second = within(
    within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem")[1]!,
  );
  expect(second.queryByText(/Tenue/)).toBeNull();
});

test("an anonymous visitor can read the planning", async () => {
  await renderWithSession(<PlanningRepet />);
  expect(
    within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem"),
  ).toHaveLength(3);
});

test("a failing API renders a message rather than an empty page", async () => {
  server.use(
    http.get("/api/events", () =>
      HttpResponse.json(
        { error: "Service unavailable", code: "service_unavailable", fields: [] },
        { status: 503 },
      ),
    ),
  );

  await renderWithSession(<PlanningRepet />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Le planning n’a pas pu être chargé.");
});

test("an empty planning renders the headings and no rows, not a crash", async () => {
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  await renderWithSession(<PlanningRepet />);
  expect(
    await screen.findByRole("heading", { name: /Planning des prestations/ }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Événements" })).queryAllByRole("listitem"),
  ).toHaveLength(0);
});
