import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Agenda } from "./Agenda";
import { Home } from "./Home";

/** An enveloped agenda of `count` appearances, a week apart. */
function agendaOf(count: number) {
  const data = Array.from({ length: count }, (_, index) => {
    const start = new Date(Date.now() + (index + 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 2 * 3600000);
    return {
      title: `Sortie ${index + 1}`,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      location: "Fribourg",
    };
  });

  return HttpResponse.json({ data, meta: { total: count, limit: 500, offset: 0 } });
}

test("lists every upcoming public appearance", async () => {
  await renderWithSession(<Agenda />, { route: "/agenda" });

  expect(await screen.findByText("Vendanges Cheyres")).toBeInTheDocument();
});

/** The private planning stays private: five of the six seeded events are not public. */
test("keeps the rehearsals off the page", async () => {
  await renderWithSession(<Agenda />, { route: "/agenda" });

  await screen.findByText("Vendanges Cheyres");
  expect(screen.queryByText(/Répétition/)).not.toBeInTheDocument();
  expect(screen.queryByText("Werkhof")).not.toBeInTheDocument();
});

/**
 * THE OPPOSITE OF THE FRONT PAGE'S BLOCK, and the reason they are two
 * components. Somebody who navigated here asked for the schedule, so a heading
 * over blank space reads as a page that failed to load.
 *
 * Mutation-tested: returning null on an empty list, the way PublicAgenda does,
 * fails this test and no other.
 */
test("says the dates are not published yet rather than showing nothing", async () => {
  server.use(http.get("/api/v1/agenda", () => agendaOf(0)));

  await renderWithSession(<Agenda />, { route: "/agenda" });

  expect(await screen.findByText(/pas encore publiées/)).toBeInTheDocument();
});

/**
 * The wording has to be true WHILE LOADING as well as when the list is really
 * empty — "aucune date" would be a claim the page cannot support until the
 * request lands.
 */
test("never claims there are no dates", async () => {
  server.use(http.get("/api/v1/agenda", () => agendaOf(0)));

  await renderWithSession(<Agenda />, { route: "/agenda" });

  await screen.findByText(/pas encore publiées/);
  expect(screen.queryByText(/aucune date/i)).not.toBeInTheDocument();
});

test("the front page caps its block at three and offers the rest", async () => {
  server.use(http.get("/api/v1/agenda", () => agendaOf(5)));

  await renderWithSession(<Home />, { route: "/" });

  const block = await screen.findByRole("region", { name: "Où nous voir" });
  expect(within(block).getAllByRole("listitem")).toHaveLength(3);
  expect(within(block).getByRole("link", { name: "Toutes les dates" })).toHaveAttribute(
    "href",
    "/agenda",
  );
});

/**
 * A "toutes les dates" button under a list that already IS all the dates sends
 * somebody to a page they have just finished reading.
 */
test("the front page offers no link when it is already showing everything", async () => {
  server.use(http.get("/api/v1/agenda", () => agendaOf(2)));

  await renderWithSession(<Home />, { route: "/" });

  const block = await screen.findByRole("region", { name: "Où nous voir" });
  expect(within(block).getAllByRole("listitem")).toHaveLength(2);
  expect(within(block).queryByRole("link", { name: "Toutes les dates" })).not.toBeInTheDocument();
});
