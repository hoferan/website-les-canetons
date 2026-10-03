import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, delay, http } from "msw";
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

test("says what the band is before anything else, in German", async () => {
  await renderWithSession(<Home />, { route: "/", locale: "de-CH" });

  expect(
    screen.getByRole("heading", { name: /Kinder-Guggenmusik aus Freiburg, seit 2002/ }),
  ).toBeInTheDocument();
});

test("points every destination card at a public page, in German", async () => {
  await renderWithSession(<Home />, { route: "/", locale: "de-CH" });

  const destinations = screen.getByRole("list", { name: "Die Canetons entdecken" });
  const links = within(destinations).getAllByRole("link");

  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/join",
    "/band",
    "/history",
    "/committee",
  ]);
});

test("shows the concert photo placeholder in German", async () => {
  await renderWithSession(<Home />, { route: "/", locale: "de-CH" });

  expect(await screen.findByText(/Foto folgt/)).toBeInTheDocument();
});

test("keeps the concert placeholder while no concert photo is placed", async () => {
  const { container } = await renderWithSession(<Home />, { route: "/" });

  await waitFor(() =>
    expect(container.querySelector('[data-photo-pending="concert"]')).not.toBeNull(),
  );
});

test("reserves the concert frame, without a caption, while the site photos are still loading", async () => {
  server.use(http.get("/api/v1/site-photos", () => delay("infinite")));
  const { container } = await renderWithSession(<Home />, { route: "/" });

  await screen.findByRole("heading", { level: 1 });
  expect(container.querySelector('[data-photo-pending="concert"]')).toBeNull();
  const reserved = container.querySelector("[data-photo-reserved]");
  expect(reserved).not.toBeNull();
  expect(reserved).toHaveAttribute("aria-hidden", "true");
  expect(reserved).toBeEmptyDOMElement();
});

test("keeps the concert placeholder when the site photos cannot be read", async () => {
  server.use(http.get("/api/v1/site-photos", () => HttpResponse.error()));
  const { container } = await renderWithSession(<Home />, { route: "/" });

  await waitFor(() =>
    expect(container.querySelector('[data-photo-pending="concert"]')).not.toBeNull(),
  );
});

test("shows the placed concert photo and drops its placeholder", async () => {
  server.use(
    http.get("/api/v1/site-photos", () =>
      HttpResponse.json({
        band: null,
        concert: {
          url: "/api/v1/images/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg",
          width: 1600,
          height: 1067,
          srcset:
            "/api/v1/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg 480w, /api/v1/images/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg 960w, /api/v1/images/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg 1600w",
        },
      }),
    ),
  );
  const { container } = await renderWithSession(<Home />, { route: "/" });

  // A page slot carries no alt text, so the photo is named after the band.
  const photo = await screen.findByRole("img", { name: "Les Canetons de Fribourg" });
  // Every size is offered, and the browser is told the photo spans the text column.
  expect(photo).toHaveAttribute(
    "srcset",
    expect.stringContaining(
      "/api/v1/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg 480w",
    ),
  );
  expect(photo).toHaveAttribute("sizes", "(min-width: 704px) 672px, calc(100vw - 32px)");
  expect(container.querySelector('[data-photo-pending="concert"]')).toBeNull();
});
