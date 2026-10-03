import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";

import type { ImageResource } from "../api/generated/model";
import { setLocale } from "../i18n";
import { LibraryGrid } from "../images/LibraryGrid";
import type { UploadFn } from "../images/uploadQueue";
import { addUnusedMockImage, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { AppRoutes } from "../routes";
import { renderWithSession } from "../test/renderWithSession";
import { Media } from "./Media";

/** jsdom cannot shrink through a canvas or send a multipart body, so both are injected. */
const shrinker = async (file: File) => [file];

async function renderMedia(upload: UploadFn = async () => ({ status: 200, id: 1 })) {
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route
        path="/media"
        element={
          <>
            <Media upload={upload} shrinker={shrinker} />
            <Link to="/band">Vers la page du groupe</Link>
          </>
        }
      />
      <Route path="/band" element={<h1>Page du groupe</h1>} />
    </Routes>,
    { route: "/media" },
  );
}

const files = (n: number) =>
  Array.from({ length: n }, (_, i) => new File(["x"], `photo-${i}.jpg`, { type: "image/jpeg" }));

const card = (id: number) => screen.getByTestId(`library-card-${id}`);

test("the header counts the library against its capacity and gives its size", async () => {
  await renderMedia();
  // 412 000 + 318 000 bytes.
  expect(await screen.findByTestId("photos-summary")).toHaveTextContent(
    /^2 \/ 100 photos · 0,7\sMo$/,
  );
  expect(
    screen.getByText(
      "Avant de publier la photo d’un enfant, assurez-vous que ses parents sont d’accord.",
    ),
  ).toBeInTheDocument();
});

test("a selection larger than the places left is announced, and the queue still starts", async () => {
  server.use(
    http.get("/api/v1/images/summary", () =>
      HttpResponse.json({ count: 98, capacity: 100, bytesTotal: 1_000_000 }),
    ),
  );
  const upload = vi.fn<UploadFn>(async () => ({ status: 200, id: 1 }));
  await renderMedia(upload);
  await screen.findByText(/^98 \/ 100 photos/);

  await userEvent.setup().upload(screen.getByTestId("photos-input"), files(3));

  expect(
    await screen.findByText("2 places restantes : les photos au-delà ne seront pas ajoutées."),
  ).toBeInTheDocument();
  await waitFor(() => expect(upload).toHaveBeenCalled());
});

test("a selection that fits says nothing about places", async () => {
  // Never settles, so the cards stay on screen.
  await renderMedia(() => new Promise(() => {}));
  await screen.findByText(/^2 \/ 100 photos/);
  await userEvent.setup().upload(screen.getByTestId("photos-input"), files(2));
  await screen.findByTestId("upload-cards");
  expect(screen.queryByText(/places? restantes?/)).toBeNull();
});

/**
 * Each place a photo is shown is a link to that page, where the photo is also
 * changed. A register goes to /band without its anchor: ScrollToTop leaves a
 * hashed URL alone, so the anchor would open /band at /media's scroll offset.
 */
test("each library card links to where the photo is shown, or says it is unused", async () => {
  const unused = addUnusedMockImage();
  await renderMedia();
  await waitFor(() => expect(card(unused)).toBeInTheDocument());

  expect(within(card(unused)).getByText("Non utilisée")).toBeInTheDocument();
  // Its own page is the only link an unused photo has.
  expect(
    within(card(unused))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual([`/media/${unused}`]);
  expect(within(card(1)).getByRole("link", { name: "Photo du groupe" })).toHaveAttribute(
    "href",
    "/band",
  );
  expect(within(card(2)).getByRole("link", { name: "Trompettes" })).toHaveAttribute(
    "href",
    "/band",
  );
  expect(within(card(2)).getByRole("link", { name: /^Histoire\u00a0: / })).toHaveAttribute(
    "href",
    "/history",
  );
  expect(within(card(1)).queryByText("Non utilisée")).toBeNull();
});

test("on the German side every usage link carries the /de prefix", async () => {
  await setLocale("de-CH");
  const image: ImageResource = {
    id: 1,
    name: "Le groupe",
    url: `/api/v1/images/${"1".repeat(64)}.jpg`,
    width: 800,
    height: 600,
    srcset: `/api/v1/images/${"1".repeat(64)}.jpg 800w`,
    bytes: 1000,
    sizes: [{ width: 800, height: 600, bytes: 1000, url: `/api/v1/images/${"1".repeat(64)}.jpg` }],
    createdAt: "2026-09-30T00:00:00+00:00",
    usages: [
      { slot: "band", label: "Photo du groupe", path: "/band" },
      { slot: "concert", label: "Photo en concert", path: "/" },
      { slot: "register-5", label: "Trompettes", path: "/band" },
      { slot: "history-4", label: "Le flambeau passe", path: "/history" },
    ],
  };
  // The basename is what App.tsx gives the router under /de.
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter basename="/de" initialEntries={["/de/media"]}>
        <LibraryGrid images={[image]} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const hrefs = within(screen.getByTestId("library-card-1"))
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
  expect(hrefs).toEqual(["/de/media/1", "/de/band", "/de", "/de/band", "/de/history"]);
});

test("a usage is named by the label its page sent, links to its path, and falls back to the slot name", async () => {
  server.use(
    http.get("/api/v1/images", () =>
      HttpResponse.json({
        data: [
          {
            id: 7,
            url: `/api/v1/images/${"7".repeat(64)}.jpg`,
            width: 800,
            height: 600,
            srcset: `/api/v1/images/${"7".repeat(64)}.jpg 800w`,
            bytes: 1000,
            sizes: [
              {
                width: 800,
                height: 600,
                bytes: 1000,
                url: `/api/v1/images/${"7".repeat(64)}.jpg`,
              },
            ],
            createdAt: "2026-09-30T00:00:00+00:00",
            usages: [
              { slot: "concert", label: "Photo en concert", path: "/" },
              { slot: "3f2a9c1e-7b4d-4e8a-9c2f-5d6e7f8a9b0c", label: null, path: null },
            ],
          },
        ],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );
  await renderMedia();

  const seven = await screen.findByTestId("library-card-7");
  expect(await within(seven).findByRole("link", { name: "Photo en concert" })).toHaveAttribute(
    "href",
    "/",
  );
  // Neither label nor path: the slot's own name, and no link to follow.
  expect(within(seven).getByText("3f2a9c1e-7b4d-4e8a-9c2f-5d6e7f8a9b0c").closest("a")).toBeNull();
});

test("the unused filter hides the photos that are shown somewhere", async () => {
  const unused = addUnusedMockImage();
  await renderMedia();
  await waitFor(() => expect(card(1)).toBeInTheDocument());

  await userEvent.setup().click(screen.getByRole("button", { name: "Non utilisées" }));

  expect(card(unused)).toBeInTheDocument();
  expect(screen.queryByTestId("library-card-1")).toBeNull();
  expect(screen.queryByTestId("library-card-2")).toBeNull();
});

/**
 * Counted over the whole page, not per card: a per-card "no checkbox here"
 * would also pass if no card had one at all.
 */
test("only unused photos can be selected", async () => {
  const unused = addUnusedMockImage();
  await renderMedia();
  await waitFor(() => expect(card(unused)).toBeInTheDocument());

  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(1);
  expect(boxes[0]).toHaveAccessibleName(`Sélectionner Photo inutilisée ${unused}`);
});

test("a ticked photo the search hides is not counted or deleted", async () => {
  const user = userEvent.setup();
  const unused = addUnusedMockImage();
  await renderMedia();
  await waitFor(() => expect(card(unused)).toBeInTheDocument());

  await user.click(
    screen.getByRole("checkbox", { name: `Sélectionner Photo inutilisée ${unused}` }),
  );
  expect(screen.getByRole("button", { name: "Supprimer (1)" })).toBeEnabled();

  await user.type(screen.getByRole("searchbox"), "trompette");
  expect(screen.getByRole("button", { name: "Supprimer (0)" })).toBeDisabled();

  // Cleared again, the tick is still there.
  await user.clear(screen.getByRole("searchbox"));
  expect(screen.getByRole("button", { name: "Supprimer (1)" })).toBeEnabled();
});

test("deleting several photos deletes each, and a refusal for one does not stop the others", async () => {
  const user = userEvent.setup();
  const [first, refused, last] = [addUnusedMockImage(), addUnusedMockImage(), addUnusedMockImage()];
  server.use(
    http.delete(`/api/v1/images/${refused}`, () =>
      HttpResponse.json(
        {
          title: "Conflict",
          status: 409,
          code: "image_in_use",
          instance: `/api/v1/images/${refused}`,
          errors: [],
          requestId: "01JB3K7QW8ZX7VN4S2QK9J0M1P",
          detail: "in use",
        },
        { status: 409 },
      ),
    ),
  );
  await renderMedia();
  await waitFor(() => expect(card(last)).toBeInTheDocument());

  for (const id of [first, refused, last]) {
    await user.click(screen.getByRole("checkbox", { name: `Sélectionner Photo inutilisée ${id}` }));
  }
  await user.click(screen.getByRole("button", { name: "Supprimer (3)" }));

  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Supprimer ces 3 photos ?")).toBeInTheDocument();
  // Named once every photo's tag has been read.
  await user.click(await within(dialog).findByRole("button", { name: "Supprimer" }));

  await waitFor(() => expect(screen.queryByTestId(`library-card-${first}`)).toBeNull());
  expect(screen.queryByTestId(`library-card-${last}`)).toBeNull();
  expect(card(refused)).toBeInTheDocument();
  expect(
    await screen.findByText(/Cette photo est encore affichée sur le site/),
  ).toBeInTheDocument();
  // Two seeded, three added, two deleted.
  expect(await screen.findByText(/^3 \/ 100 photos/)).toBeInTheDocument();
});

test("leaving the page mid-queue asks first, and staying keeps the queue", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  // Never settles, so the queue stays busy.
  await renderMedia(() => new Promise(() => {}));
  await screen.findByText(/^2 \/ 100 photos/);
  await user.upload(screen.getByTestId("photos-input"), files(1));
  await screen.findByText("Envoi…");

  await user.click(screen.getByRole("link", { name: "Vers la page du groupe" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("heading", { name: "Page du groupe" })).toBeNull();
  expect(screen.getByText("Envoi…")).toBeInTheDocument();

  confirm.mockReturnValue(true);
  await user.click(screen.getByRole("link", { name: "Vers la page du groupe" }));
  expect(await screen.findByRole("heading", { name: "Page du groupe" })).toBeInTheDocument();
});

test("an idle page leaves without asking", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm");
  await renderMedia();
  await screen.findByText(/^2 \/ 100 photos/);
  await user.click(screen.getByRole("link", { name: "Vers la page du groupe" }));

  expect(await screen.findByRole("heading", { name: "Page du groupe" })).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
});

/** The cards on screen, in order, by the name each shows. */
const cardNames = () =>
  within(screen.getByTestId("library-grid"))
    .getAllByRole("listitem")
    .filter((item) => item.dataset.testid?.startsWith("library-card-"))
    .map((item) => within(item).getAllByRole("link")[0]?.textContent);

test("the search finds photos by name, ignoring case and accents, and works with the filter", async () => {
  const user = userEvent.setup();
  addUnusedMockImage("Répétition générale");
  await renderMedia();
  await screen.findByTestId("library-card-3");

  await user.type(
    screen.getByRole("searchbox", { name: "Chercher une photo par son nom" }),
    "REPET",
  );
  expect(cardNames()).toEqual(["Répétition générale", "Trompettes en répétition"]);

  // Combined with the used/unused filter.
  await user.click(screen.getByRole("button", { name: "Non utilisées" }));
  expect(cardNames()).toEqual(["Répétition générale"]);

  await user.clear(screen.getByRole("searchbox"));
  await user.type(screen.getByRole("searchbox"), "vendredi");
  expect(screen.queryByTestId("library-grid")).toBeNull();
  expect(screen.getByText("Aucune photo ne correspond à cette recherche.")).toBeInTheDocument();
});

test("the library can be ordered by date, by name or by weight", async () => {
  const user = userEvent.setup();
  await renderMedia();
  await screen.findByTestId("library-card-2");
  const order = screen.getByRole("combobox", { name: "Ordre de la bibliothèque" });

  // Newest first by default: 2 is from 27 September, 1 from the 26th.
  expect(order).toHaveValue("newest");
  expect(cardNames()).toEqual(["Trompettes en répétition", "Le groupe au Carnaval 2026"]);

  await user.selectOptions(order, "oldest");
  expect(cardNames()).toEqual(["Le groupe au Carnaval 2026", "Trompettes en répétition"]);

  await user.selectOptions(order, "name");
  expect(cardNames()).toEqual(["Le groupe au Carnaval 2026", "Trompettes en répétition"]);

  // 412 000 bytes against 318 000.
  await user.selectOptions(order, "largest");
  expect(cardNames()).toEqual(["Le groupe au Carnaval 2026", "Trompettes en répétition"]);

  await user.selectOptions(order, "newest");
  expect(cardNames()).toEqual(["Trompettes en répétition", "Le groupe au Carnaval 2026"]);
});

test("each card shows the photo's name, and the photo and its name open its own page", async () => {
  await renderMedia();

  const link = await within(await screen.findByTestId("library-card-2")).findByRole("link", {
    name: "Trompettes en répétition",
  });
  expect(link).toHaveAttribute("href", "/media/2");
  // The thumbnail is inside the same link, so the card is one stop, not two.
  expect(link.querySelector("img")).not.toBeNull();
});

test("a photo's page is refused without images.manage, and opens through the route table", async () => {
  setMockUser("demo.player");
  const refused = await renderWithSession(<AppRoutes />, { route: "/media/1" });
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
  refused.unmount();

  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/media/1" });
  expect(
    await screen.findByRole("heading", { level: 1, name: "Le groupe au Carnaval 2026" }),
  ).toBeInTheDocument();
});

test("the screen is refused without images.manage", async () => {
  setMockUser("demo.player");
  await renderWithSession(<AppRoutes />, { route: "/media" });
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
  expect(screen.queryByTestId("photos-summary")).toBeNull();
});

test("the screen opens for a holder of images.manage, through the route table", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/media" });
  expect(await screen.findByRole("heading", { level: 1, name: "Médias" })).toBeInTheDocument();
});

test("the German page counts in German", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Media shrinker={shrinker} />, { route: "/media", locale: "de-CH" });
  expect(await screen.findByTestId("photos-summary")).toHaveTextContent(
    /^2 \/ 100 Fotos · 0\.7\sMB$/,
  );
});

test("the delete dialog cannot be cancelled while the deletes run", async () => {
  const user = userEvent.setup();
  const unused = addUnusedMockImage();
  // Never answers, so the batch stays in flight.
  server.use(http.delete(`/api/v1/images/${unused}`, () => new Promise(() => {})));
  await renderMedia();
  await waitFor(() => expect(card(unused)).toBeInTheDocument());

  await user.click(
    screen.getByRole("checkbox", { name: `Sélectionner Photo inutilisée ${unused}` }),
  );
  await user.click(screen.getByRole("button", { name: "Supprimer (1)" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByRole("button", { name: "Annuler" })).toBeEnabled();

  await user.click(await within(dialog).findByRole("button", { name: "Supprimer" }));

  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "Annuler" })).toBeDisabled(),
  );
  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
});
