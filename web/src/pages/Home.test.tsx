import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, delay, http } from "msw";
import { expect, test } from "vitest";

import userEvent from "@testing-library/user-event";
import { EDIT_MODE_KEY } from "../content/EditMode";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { recordBlockPuts, storeBlock } from "../test/renderBlockEditor";
import { renderWithSession } from "../test/renderWithSession";
import { Home } from "./Home";

test("says what the band is before anything else", async () => {
  await renderWithSession(<Home />, { route: "/" });

  expect(
    screen.getByRole("heading", { name: /La guggen d’enfants de Fribourg, depuis 2002/ }),
  ).toBeInTheDocument();
});

/**
 * The destinations are curated rather than derived from the nav, so each one
 * has to be checked against a route that exists.
 */
test("points every destination card at a public page", async () => {
  await renderWithSession(<Home />, { route: "/" });

  const destinations = await screen.findByRole("list", { name: "Découvrir les Canetons" });
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
 * A rehearsal is not an appearance. Listing private events would publish the
 * band's whole diary, addresses included, on the front page.
 */
test("keeps the private planning off the front page", async () => {
  await renderWithSession(<Home />, { route: "/" });

  await screen.findByRole("region", { name: "Où nous voir" });
  expect(screen.queryByText(/Répétition/)).not.toBeInTheDocument();
  expect(screen.queryByText("Werkhof")).not.toBeInTheDocument();
});

/**
 * The agenda renders nothing when empty, by design: "Aucun événement" on a
 * band's front page reads as "this band does nothing". Replacing the early
 * return with an empty-state card fails this test and no other.
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

/**
 * The destination cards wait for the agenda above them, or the arriving dates
 * would push them out of a phone's first screen (#236). The hero does not wait.
 */
test("holds the destination cards while the agenda is loading", async () => {
  server.use(http.get("/api/v1/agenda", () => delay("infinite")));

  await renderWithSession(<Home />, { route: "/" });

  expect(screen.getByRole("heading", { name: /depuis 2002/ })).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Découvrir les Canetons" })).not.toBeInTheDocument();
});

test("shows the destination cards when the agenda cannot be read", async () => {
  server.use(http.get("/api/v1/agenda", () => new HttpResponse(null, { status: 503 })));

  await renderWithSession(<Home />, { route: "/" });

  expect(await screen.findByRole("list", { name: "Découvrir les Canetons" })).toBeInTheDocument();
});

test("says what the band is before anything else, in German", async () => {
  await renderWithSession(<Home />, { route: "/", locale: "de-CH" });

  expect(
    screen.getByRole("heading", { name: /Kinder-Guggenmusik aus Freiburg, seit 2002/ }),
  ).toBeInTheDocument();
});

test("points every destination card at a public page, in German", async () => {
  await renderWithSession(<Home />, { route: "/", locale: "de-CH" });

  const destinations = await screen.findByRole("list", { name: "Die Canetons entdecken" });
  const links = within(destinations).getAllByRole("link");

  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/de/join",
    "/de/band",
    "/de/history",
    "/de/committee",
  ]);
});

test("describes the band's badge in German", async () => {
  await renderWithSession(<Home />, { route: "/", locale: "de-CH" });

  // The badge waits for the photo slots, which the hero picture may replace it with.
  expect(
    await screen.findByRole("img", { name: "Das Logo der Canetons de Fribourg" }),
  ).toBeInTheDocument();
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

test("reserves the concert frame, without a caption, while the photo slots are still loading", async () => {
  server.use(http.get("/api/v1/photo-slots", () => delay("infinite")));
  const { container } = await renderWithSession(<Home />, { route: "/" });

  await screen.findByRole("heading", { level: 1 });
  expect(container.querySelector('[data-photo-pending="concert"]')).toBeNull();
  const reserved = container.querySelector("[data-photo-reserved]");
  expect(reserved).not.toBeNull();
  expect(reserved).toHaveAttribute("aria-hidden", "true");
  expect(reserved).toBeEmptyDOMElement();
});

test("keeps the concert placeholder when the photo slots cannot be read", async () => {
  server.use(http.get("/api/v1/photo-slots", () => HttpResponse.error()));
  const { container } = await renderWithSession(<Home />, { route: "/" });

  await waitFor(() =>
    expect(container.querySelector('[data-photo-pending="concert"]')).not.toBeNull(),
  );
});

test("shows the placed concert photo and drops its placeholder", async () => {
  server.use(
    http.get("/api/v1/photo-slots", () =>
      HttpResponse.json({
        meta: { total: 1, limit: 500, offset: 0 },
        data: [
          {
            slot: "concert",
            url: "/api/v1/images/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg",
            width: 1600,
            height: 1067,
            srcset:
              "/api/v1/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg 480w, /api/v1/images/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg 960w, /api/v1/images/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg 1600w",
          },
        ],
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

const heroPhoto = {
  slot: "home.hero",
  url: "/api/v1/images/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.jpg",
  width: 1200,
  height: 900,
  srcset:
    "/api/v1/images/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.jpg 1200w",
};

function placeHeroPhoto() {
  server.use(
    http.get("/api/v1/photo-slots", () =>
      HttpResponse.json({ meta: { total: 1, limit: 500, offset: 0 }, data: [heroPhoto] }),
    ),
  );
}

const hero = (container: HTMLElement) => container.querySelector<HTMLElement>(".bg-poster")!;

test("the hero's two buttons are the join and agenda pages, as shipped", async () => {
  const { container } = await renderWithSession(<Home />, { route: "/" });

  const [first, second] = within(hero(container)).getAllByRole("link");
  expect(first).toHaveTextContent("Nous rejoindre");
  expect(first).toHaveAttribute("href", "/join");
  expect(second).toHaveTextContent("Où nous voir");
  expect(second).toHaveAttribute("href", "/agenda");
});

test("the hero's buttons read the stored block, in German too", async () => {
  storeBlock("home.hero", {
    title: { fr: "Bonjour" },
    actions: [{ label: { fr: "Photos", de: "Fotos" }, to: "https://www.flickr.com/canetons" }],
  });
  const { container } = await renderWithSession(<Home />, { route: "/", locale: "de-CH" });

  const links = within(hero(container)).getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveTextContent("Fotos");
  expect(links[0]).toHaveAttribute("href", "https://www.flickr.com/canetons");
});

test("a hero emptied of buttons draws no row of them", async () => {
  storeBlock("home.hero", { title: { fr: "Bonjour" }, actions: [] });
  const { container } = await renderWithSession(<Home />, { route: "/" });

  await screen.findByRole("heading", { level: 1, name: "Bonjour" });
  expect(within(hero(container)).queryByRole("link")).toBeNull();
});

test("the badge stands beside the heading while no picture is placed", async () => {
  await renderWithSession(<Home />, { route: "/" });

  const logo = await screen.findByRole("img", { name: "Le logo des Canetons de Fribourg" });
  expect(logo).toHaveAttribute("src", "/assets/img/Les_Canetons_Fribourg_logo_2.jpg");
  expect(logo.className).toContain("rotate-[4deg]");
  expect(logo.className).toContain("border-white");
  expect(screen.queryByRole("button", { name: /Image de l’en-tête/ })).toBeNull();
});

test("a placed picture takes the badge's frame", async () => {
  placeHeroPhoto();
  await renderWithSession(<Home />, { route: "/" });

  // The badge is drawn first and the photo replaces it once the slots answer.
  const photo = await waitFor(() => {
    const placed = document.querySelector<HTMLImageElement>(`img[src="${heroPhoto.url}"]`);
    expect(placed).not.toBeNull();
    return placed!;
  });
  expect(photo.className).toContain("rotate-[4deg]");
  expect(photo.className).toContain("border-white");
  expect(photo.className).toContain("w-48");
  expect(document.querySelector('img[src$="Les_Canetons_Fribourg_logo_2.jpg"]')).toBeNull();
  // A photograph of the band, not the logo it replaces.
  expect(photo).toHaveAttribute("alt", "Les Canetons de Fribourg");
  expect(screen.queryByRole("img", { name: "Le logo des Canetons de Fribourg" })).toBeNull();
});

test("an editor with edit mode on gets the picture's control, the badge still showing", async () => {
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<Home />, { route: "/" });

  expect(
    await screen.findByRole("button", { name: "Ajouter une photo — Image de l’en-tête" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Le logo des Canetons de Fribourg" })).toHaveAttribute(
    "src",
    "/assets/img/Les_Canetons_Fribourg_logo_2.jpg",
  );
});

test("the control offers to change a placed picture", async () => {
  placeHeroPhoto();
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<Home />, { route: "/" });

  expect(
    await screen.findByRole("button", { name: "Changer la photo — Image de l’en-tête" }),
  ).toBeInTheDocument();
});

test("edit mode off, an editor sees the badge as a visitor does", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Home />, { route: "/" });

  await screen.findByRole("img", { name: "Le logo des Canetons de Fribourg" });
  expect(screen.queryByRole("button", { name: /Image de l’en-tête/ })).toBeNull();
});

test("a hero stored before it had buttons keeps the shipped ones", async () => {
  storeBlock("home.hero", { title: { fr: "Bonjour" } });
  const { container } = await renderWithSession(<Home />, { route: "/" });

  await screen.findByRole("heading", { level: 1, name: "Bonjour" });
  const links = within(hero(container)).getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual(["/join", "/agenda"]);
});

test("such a hero, opened in the editor and saved, keeps the shipped buttons", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  storeBlock("home.hero", { title: { fr: "Bonjour" } });
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<Home />, { route: "/" });

  await user.click(
    await screen.findByRole("button", { name: "Modifier : Accueil · en-tête (sans allemand)" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => expect(puts).toHaveLength(1));
  const data = (puts[0]!.body as { data: { actions: unknown } }).data;
  expect(data.actions).toEqual([
    { label: { fr: "Nous rejoindre", de: "Mitmachen" }, to: "/join" },
    { label: { fr: "Où nous voir", de: "Wo Sie uns sehen" }, to: "/agenda" },
  ]);
});

test("the badge is drawn while the photo slots are still loading", async () => {
  server.use(http.get("/api/v1/photo-slots", () => delay("infinite")));
  await renderWithSession(<Home />, { route: "/" });

  expect(screen.getByRole("img", { name: "Le logo des Canetons de Fribourg" })).toHaveAttribute(
    "src",
    "/assets/img/Les_Canetons_Fribourg_logo_2.jpg",
  );
});

test("a placed picture is cropped to the badge's proportions", async () => {
  placeHeroPhoto();
  await renderWithSession(<Home />, { route: "/" });

  // The badge is drawn first and the photo replaces it once the slots answer.
  const photo = await waitFor(() => {
    const placed = document.querySelector<HTMLImageElement>(`img[src="${heroPhoto.url}"]`);
    expect(placed).not.toBeNull();
    return placed!;
  });
  expect(photo.className).toContain("aspect-[237/174]");
  expect(photo.className).toContain("object-cover");
  expect(photo.className).not.toContain("h-auto");
});
