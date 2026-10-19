import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Agenda } from "./Agenda";
import { Home } from "./Home";

/** An enveloped agenda of `count` appearances, a week apart, none bookable. */
function agendaOf(count: number, registrationOpen = false) {
  const data = Array.from({ length: count }, (_, index) => {
    const start = new Date(Date.now() + (index + 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 2 * 3600000);
    return {
      id: index + 1,
      title: `Sortie ${index + 1}`,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      location: "Fribourg",
      registrationOpen,
      tags: [],
    };
  });

  return HttpResponse.json({ data, meta: { total: count, limit: 500, offset: 0 } });
}

test("lists every upcoming public appearance", async () => {
  await renderWithSession(<Agenda />, { route: "/agenda" });

  expect(await screen.findByText("Vendanges Cheyres")).toBeInTheDocument();
});

test("shows an appearance's tags", async () => {
  await renderWithSession(<Agenda />, { route: "/agenda" });

  const entry = (await screen.findByText("Vendanges Cheyres")).closest("li");
  expect(entry).not.toBeNull();
  expect(within(entry as HTMLElement).getByText("Sortie")).toBeInTheDocument();
});

/** The private planning stays private: five of the six seeded events are not public. */
test("keeps the rehearsals off the page", async () => {
  await renderWithSession(<Agenda />, { route: "/agenda" });

  await screen.findByText("Vendanges Cheyres");
  expect(screen.queryByText(/Répétition/)).not.toBeInTheDocument();
  expect(screen.queryByText("Werkhof")).not.toBeInTheDocument();
});

/**
 * The opposite of the front page's block: somebody who navigated here asked
 * for the schedule. Returning null on an empty list, as PublicAgenda does,
 * fails this test and no other.
 */
test("says the dates are not published yet rather than showing nothing", async () => {
  server.use(http.get("/api/v1/agenda", () => agendaOf(0)));

  await renderWithSession(<Agenda />, { route: "/agenda" });

  expect(await screen.findByText(/pas encore publiées/)).toBeInTheDocument();
});

/**
 * The wording has to be true while loading as well as when the list is empty;
 * "aucune date" is a claim the page cannot make until the request lands.
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

/** "Toutes les dates" under a list that already is all the dates is useless. */
test("the front page offers no link when it is already showing everything", async () => {
  server.use(http.get("/api/v1/agenda", () => agendaOf(2)));

  await renderWithSession(<Home />, { route: "/" });

  const block = await screen.findByRole("region", { name: "Où nous voir" });
  expect(within(block).getAllByRole("listitem")).toHaveLength(2);
  expect(within(block).queryByRole("link", { name: "Toutes les dates" })).not.toBeInTheDocument();
});

/* ---------------------------------------------------------------------------
 * The way in to the booking form
 * -------------------------------------------------------------------------- */

/**
 * The only way a visitor reaches the booking form from inside the site, and
 * why PublicEventResource carries an id. Without it the form is typed-URL-only.
 */
test("offers a booking link on an event that is taking bookings", async () => {
  await renderWithSession(<Agenda />, { route: "/agenda" });

  const link = await screen.findByRole("link", { name: "S’inscrire — Souper de soutien" });
  expect(link).toHaveAttribute("href", "/events/7/book");
});

/**
 * The link follows `registrationOpen`: offering "S’inscrire" on an event whose
 * window is shut sends the reader to a form that refuses them.
 */
test("offers none on an event whose window is shut", async () => {
  server.use(http.get("/api/v1/agenda", () => agendaOf(1)));

  await renderWithSession(<Agenda />, { route: "/agenda" });

  await screen.findByText("Sortie 1");
  expect(screen.queryByRole("link", { name: /S’inscrire/ })).not.toBeInTheDocument();
});

test("renders the whole page in German", async () => {
  await renderWithSession(<Agenda />, { route: "/agenda", locale: "de-CH" });

  expect(screen.getByRole("heading", { name: "Wo Sie uns sehen" })).toBeInTheDocument();
  expect(await screen.findByText("Vendanges Cheyres")).toBeInTheDocument();
});

test("says the dates are not published yet, in German", async () => {
  server.use(http.get("/api/v1/agenda", () => agendaOf(0)));

  await renderWithSession(<Agenda />, { route: "/agenda", locale: "de-CH" });

  expect(await screen.findByText(/noch nicht veröffentlicht/)).toBeInTheDocument();
});

test("offers a booking link in German", async () => {
  await renderWithSession(<Agenda />, { route: "/agenda", locale: "de-CH" });

  const link = await screen.findByRole("link", { name: "Jetzt anmelden — Souper de soutien" });
  expect(link).toHaveAttribute("href", "/events/7/book");
});
