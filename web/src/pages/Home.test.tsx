import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Home } from "./Home";

test("says what the band is before anything else", async () => {
  await renderWithSession(<Home />, { route: "/" });

  expect(
    screen.getByRole("heading", { name: /La guggen d’enfants de Fribourg, depuis 2002/ }),
  ).toBeInTheDocument();
});

/**
 * THE DESTINATIONS ARE CURATED, NOT DERIVED FROM THE NAV. Every one of them
 * still has to point at a route that exists — a front door whose cards 404 is
 * worse than a front door with none.
 */
test("points every destination card at a public page", async () => {
  await renderWithSession(<Home />, { route: "/" });

  const destinations = screen.getByRole("list", { name: "Découvrir les Canetons" });
  const links = within(destinations).getAllByRole("link");

  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/join",
    "/band",
    "/history",
    "/committee",
  ]);
});

test("shows the next public appearance", async () => {
  await renderWithSession(<Home />, { route: "/" });

  const agenda = await screen.findByRole("region", { name: "Où nous voir" });
  expect(within(agenda).getByText("Vendanges Cheyres")).toBeInTheDocument();
  expect(within(agenda).getByText("Cheyres")).toBeInTheDocument();
});

/**
 * A rehearsal is not an appearance. Five of the six seeded events are private,
 * and a page that listed them would publish the band's whole diary — addresses
 * included — to anybody who loaded the front page.
 */
test("keeps the private planning off the front page", async () => {
  await renderWithSession(<Home />, { route: "/" });

  await screen.findByRole("region", { name: "Où nous voir" });
  expect(screen.queryByText(/Répétition/)).not.toBeInTheDocument();
  expect(screen.queryByText("Werkhof")).not.toBeInTheDocument();
});

/**
 * THE AGENDA IS ALLOWED TO RENDER NOTHING, and that is the design rather than
 * a missing empty state. "Aucun événement" on a band's front page reads as
 * "this band does nothing", and an error about a schedule the visitor never
 * asked for is noise on the page where noise is most visible.
 *
 * Mutation-tested: replacing the early return with an empty-state card fails
 * this test and no other.
 */
test("renders no agenda section at all when there is nothing public coming up", async () => {
  server.use(
    http.get("/api/v1/agenda", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );

  await renderWithSession(<Home />, { route: "/" });

  // The hero is there, so the page rendered; the section simply is not.
  expect(screen.getByRole("heading", { name: /depuis 2002/ })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Où nous voir" })).not.toBeInTheDocument();
});

/** The same silence when the read fails: the hero must never wait on it. */
test("renders no agenda section when the read is refused", async () => {
  server.use(http.get("/api/v1/agenda", () => new HttpResponse(null, { status: 503 })));

  await renderWithSession(<Home />, { route: "/" });

  expect(screen.getByRole("heading", { name: /depuis 2002/ })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Où nous voir" })).not.toBeInTheDocument();
});
