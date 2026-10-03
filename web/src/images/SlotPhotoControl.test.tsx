import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test, vi } from "vitest";

import { ApiError } from "../api/http";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { Band } from "../pages/Band";
import { Home } from "../pages/Home";
import { renderWithSession } from "../test/renderWithSession";
import { SlotPhoto } from "./SlotPhoto";

/**
 * The control a page slot carries for whoever holds images.manage (#105).
 *
 * The mock places image 1 on the band and image 2 on Trompettes (register 5);
 * Cloches (register 4) and the concert are empty.
 */

type Put = { path: string; ifMatch: string | null; body: unknown };

/** Records every placement PUT, then lets the mock answer it. */
function recordPuts(): Put[] {
  const puts: Put[] = [];
  const record = async ({ request }: { request: Request }) => {
    puts.push({
      path: new URL(request.url).pathname,
      ifMatch: request.headers.get("If-Match"),
      body: await request.clone().json(),
    });
  };
  server.use(
    http.put("/api/v1/site-photos/:slot", record),
    http.put("/api/v1/sections/:id/photo", record),
  );
  return puts;
}

test("a visitor and a member without images.manage see no control", async () => {
  setMockUser(null);
  const { unmount } = await renderWithSession(<Band />, { route: "/band" });
  await screen.findByRole("article", { name: "Cloches" });
  expect(screen.queryByTestId("slot-photo-control")).toBeNull();
  unmount();

  setMockUser("demo.player");
  await renderWithSession(<Band />, { route: "/band" });
  await screen.findByRole("article", { name: "Cloches" });
  expect(screen.queryByRole("button", { name: /^(Changer|Ajouter) une? photo/ })).toBeNull();
});

test("picking a photo for a register writes that register alone, with no tag to quote", async () => {
  setMockUser("demo.direction");
  const user = userEvent.setup();
  const puts = recordPuts();
  await renderWithSession(<Band />, { route: "/band" });

  const bells = await screen.findByRole("article", { name: "Cloches" });
  expect(within(bells).queryByRole("img")).toBeNull();
  await user.click(within(bells).getByRole("button", { name: "Ajouter une photo — Cloches" }));
  // Nothing to remove from an empty slot.
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retirer la photo" })).toBeNull();
  await user.click(await screen.findByRole("button", { name: "Le groupe au Carnaval 2026" }));

  // The page re-reads /band and shows the photo, named after the register.
  expect(await within(bells).findByRole("img", { name: "Cloches" })).toBeInTheDocument();
  expect(puts).toEqual([{ path: "/api/v1/sections/4/photo", ifMatch: null, body: { imageId: 1 } }]);
  // Trompettes keeps its photo: no other slot was sent.
  const trumpets = screen.getByRole("article", { name: "Trompettes" });
  expect(within(trumpets).getByRole("img", { name: "Trompettes" })).toBeInTheDocument();
});

/**
 * MUTATION TEST: drop the refocus effect and focus stays on <body>, because
 * the add button the dialog returned focus to is gone.
 */
test("after a pick, focus is on the slot's pencil and the result is read out", async () => {
  setMockUser("demo.direction");
  const user = userEvent.setup();
  await renderWithSession(<Band />, { route: "/band" });

  const bells = await screen.findByRole("article", { name: "Cloches" });
  await user.click(within(bells).getByRole("button", { name: "Ajouter une photo — Cloches" }));
  await user.click(await screen.findByRole("button", { name: "Le groupe au Carnaval 2026" }));

  const pencil = await within(bells).findByRole("button", {
    name: "Changer la photo du registre Cloches",
  });
  await waitFor(() => expect(pencil).toHaveFocus());
  expect(within(bells).getByRole("status")).toHaveTextContent("Photo placée.");
});

test("Retirer la photo empties the slot it is on, and focus moves to its add button", async () => {
  setMockUser("demo.direction");
  const user = userEvent.setup();
  const puts = recordPuts();
  const { container } = await renderWithSession(<Band />, { route: "/band" });

  await user.click(await screen.findByRole("button", { name: "Changer la photo du groupe" }));
  await user.click(await screen.findByRole("button", { name: "Retirer la photo" }));

  // The band photo gives way to the empty frame and its add button.
  const add = await screen.findByRole("button", { name: "Ajouter une photo — photo du groupe" });
  expect(container.querySelector('[data-photo-pending="band"]')).not.toBeNull();
  expect(puts).toEqual([
    { path: "/api/v1/site-photos/band", ifMatch: null, body: { imageId: null } },
  ]);
  await waitFor(() => expect(add).toHaveFocus());
  expect(screen.getByText("Photo retirée.")).toBeInTheDocument();
});

test("the concert photo is changed on the home page", async () => {
  setMockUser("demo.direction");
  const user = userEvent.setup();
  const puts = recordPuts();
  await renderWithSession(<Home />, { route: "/" });

  await user.click(
    await screen.findByRole("button", { name: "Ajouter une photo — photo en concert" }),
  );
  await user.click(await screen.findByRole("button", { name: "Trompettes en répétition" }));

  expect(await screen.findByRole("img", { name: "Les Canetons de Fribourg" })).toBeInTheDocument();
  expect(puts).toEqual([
    { path: "/api/v1/site-photos/concert", ifMatch: null, body: { imageId: 2 } },
  ]);
});

test("a write the server refuses says so under the slot and changes nothing", async () => {
  setMockUser("demo.direction");
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/sections/:id/photo", () =>
      HttpResponse.json(
        {
          title: "Service Unavailable",
          status: 503,
          code: "service_unavailable",
          instance: "/api/v1/sections/4/photo",
          errors: [],
          requestId: "01JB3K7QW8ZX7VN4S2QK9J0M1P",
          detail: "down",
        },
        { status: 503 },
      ),
    ),
  );
  await renderWithSession(<Band />, { route: "/band" });

  const bells = await screen.findByRole("article", { name: "Cloches" });
  await user.click(within(bells).getByRole("button", { name: "Ajouter une photo — Cloches" }));
  await user.click(await screen.findByRole("button", { name: "Le groupe au Carnaval 2026" }));

  expect(await within(bells).findByRole("alert")).not.toBeEmptyDOMElement();
  expect(within(bells).queryByRole("img")).toBeNull();
  expect(within(bells).getByRole("status")).toBeEmptyDOMElement();
});

test("the control speaks German on the German page", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Band />, { route: "/band", locale: "de-CH" });

  const bells = await screen.findByRole("article", { name: "Cloches" });
  const button = within(bells).getByRole("button", {
    name: "Foto hinzufügen – Cloches",
  });
  expect(button).toHaveTextContent("Foto hinzufügen");

  // The band has a photo in the mock, so its control is the pencil.
  expect(screen.getByRole("button", { name: "Foto ändern: ganze Gruppe" })).toBeInTheDocument();
});

test("an empty slot is one button the shape of a photo, and no other control", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Band />, { route: "/band" });

  const bells = await screen.findByRole("article", { name: "Cloches" });
  const add = within(bells).getByRole("button", { name: "Ajouter une photo — Cloches" });
  // The whole frame is the button: a 3:2 box, as wide as the column.
  expect(add).toHaveClass("aspect-[3/2]", "w-full");
  expect(add.closest("[data-photo-pending]")).not.toBeNull();
  expect(add).toHaveTextContent("Ajouter une photo");
  expect(add).toHaveTextContent("Depuis la médiathèque ou votre appareil");
  // One control for the slot: no change button beside the box.
  expect(within(bells).getAllByRole("button")).toHaveLength(1);
});

test("a placed photo carries an icon-only pencil, and nothing sits under it", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Band />, { route: "/band" });

  const trumpets = await screen.findByRole("article", { name: "Trompettes" });
  await within(trumpets).findByRole("img", { name: "Trompettes" });
  const pencil = within(trumpets).getByRole("button", {
    name: "Changer la photo du registre Trompettes",
  });
  // Icon only on a phone. From sm up, hovering the photo or focusing the pencil
  // shows the word beside it; the 44px floor holds either way.
  expect(pencil).toHaveClass("h-11", "min-w-11");
  const word = within(pencil).getByText("Changer");
  expect(word).toHaveClass(
    "hidden",
    "sm:group-hover/frame:inline",
    "sm:group-focus-visible/pencil:inline",
  );
  // The pencil shares an ancestor with the photo: it is part of the image.
  expect(pencil.closest("[data-photo-frame]")?.querySelector("img")).not.toBeNull();
  expect(within(trumpets).getAllByRole("button")).toHaveLength(1);
  expect(trumpets.querySelector("[data-photo-pending]")).toBeNull();
});

test("the picker opens from the pencil and removing the photo empties the slot", async () => {
  setMockUser("demo.direction");
  const user = userEvent.setup();
  recordPuts();
  await renderWithSession(<Band />, { route: "/band" });

  const trumpets = await screen.findByRole("article", { name: "Trompettes" });
  await user.click(
    await within(trumpets).findByRole("button", {
      name: "Changer la photo du registre Trompettes",
    }),
  );
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "Retirer la photo" }));
  await within(trumpets).findByRole("button", { name: "Ajouter une photo — Trompettes" });
});

test("a visitor sees the photo and the placeholder without any control", async () => {
  setMockUser(null);
  await renderWithSession(<Band />, { route: "/band" });

  const trumpets = await screen.findByRole("article", { name: "Trompettes" });
  await within(trumpets).findByRole("img", { name: "Trompettes" });
  const bells = screen.getByRole("article", { name: "Cloches" });
  expect(within(trumpets).queryByRole("button")).toBeNull();
  expect(within(bells).queryByRole("button")).toBeNull();
  expect(within(bells).getByText(/Photo à venir/)).toBeInTheDocument();
  // No wrapper around a visitor's photo.
  expect(trumpets.querySelector("[data-photo-frame]")).toBeNull();
});

/** MUTATION TEST: give PhotoPending back its 3:2 frame and this fails. */
test("a visitor's empty slot is one quiet line, not a photo-sized box", async () => {
  setMockUser(null);
  await renderWithSession(<Band />, { route: "/band" });

  const bells = await screen.findByRole("article", { name: "Cloches" });
  const line = bells.querySelector<HTMLElement>('[data-photo-pending="register"]');
  expect(line).not.toBeNull();
  expect(line?.tagName).toBe("P");
  expect(line?.className).not.toMatch(/aspect-/);
  expect(line?.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  expect(line).toHaveTextContent("Photo à venir");
  expect(within(bells).queryByRole("button")).toBeNull();
});

/* ------------------------------------------------------------------------ *
 * Dropping a file on a slot. The real shrink and multipart upload cannot run
 * in jsdom, so both are injected; web/e2e/media.spec.ts runs the real ones.
 * ------------------------------------------------------------------------ */

const cloches = { kind: "register", sectionId: 4, name: "Cloches" } as const;
const jpeg = (name = "photo.jpg") => new File(["x"], name, { type: "image/jpeg" });

/** What a desktop browser hands a drag handler for the given files. */
function dropEvent(files: File[]) {
  return { dataTransfer: { files, types: files.length > 0 ? ["Files"] : ["text/plain"] } };
}

function injected() {
  const shrunk = [
    new Blob(["shrunk"], { type: "image/jpeg" }),
    new Blob(["s"], { type: "image/jpeg" }),
  ];
  const shrinker = vi.fn(async (_file: File) => shrunk);
  // A duplicate of image 1, which the mock library holds.
  const upload = vi.fn(async (_sizes: Blob[]) => ({ status: 200 as const, id: 1 }));
  return { shrunk, shrinker, upload };
}

test("one photo dropped on an empty slot is shrunk, uploaded and placed there", async () => {
  setMockUser("demo.direction");
  const puts = recordPuts();
  const { shrunk, shrinker, upload } = injected();
  await renderWithSession(
    <SlotPhoto slot={cloches} photo={null} alt="Cloches" upload={upload} shrinker={shrinker} />,
  );

  const add = screen.getByRole("button", { name: "Ajouter une photo — Cloches" });
  fireEvent.drop(add, dropEvent([jpeg()]));

  await waitFor(() => expect(puts).toHaveLength(1));
  expect(shrinker).toHaveBeenCalledTimes(1);
  expect(upload).toHaveBeenCalledWith(shrunk, "photo");
  expect(puts[0]).toEqual({
    path: "/api/v1/sections/4/photo",
    ifMatch: null,
    body: { imageId: 1 },
  });
});

test("a photo dropped on a placed photo replaces it", async () => {
  setMockUser("demo.direction");
  const puts = recordPuts();
  const { shrinker } = injected();
  const upload = vi.fn(async (_sizes: Blob[]) => ({ status: 200 as const, id: 2 }));
  await renderWithSession(
    <SlotPhoto
      slot={{ kind: "band" }}
      photo={{
        url: "/api/v1/images/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.jpg",
        width: 3,
        height: 2,
        srcset:
          "/api/v1/images/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.jpg 3w",
      }}
      alt="Les Canetons de Fribourg"
      upload={upload}
      shrinker={shrinker}
    />,
  );

  fireEvent.drop(screen.getByRole("img"), dropEvent([jpeg()]));

  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0]).toEqual({
    path: "/api/v1/site-photos/band",
    ifMatch: null,
    body: { imageId: 2 },
  });
});

test("dragging a file over the slot says where it goes, and leaving clears it", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<SlotPhoto slot={cloches} photo={null} alt="Cloches" />);

  const add = screen.getByRole("button", { name: "Ajouter une photo — Cloches" });
  expect(screen.queryByText("Déposer pour ajouter")).toBeNull();
  fireEvent.dragEnter(add, dropEvent([jpeg()]));
  expect(screen.getByText("Déposer pour ajouter")).toBeInTheDocument();
  fireEvent.dragLeave(add, dropEvent([jpeg()]));
  expect(screen.queryByText("Déposer pour ajouter")).toBeNull();
});

test("the slot shows progress while the dropped photo is prepared", async () => {
  setMockUser("demo.direction");
  let finish!: (sizes: Blob[]) => void;
  const shrinker = vi.fn(() => new Promise<Blob[]>((resolve) => (finish = resolve)));
  const { upload } = injected();
  recordPuts();
  await renderWithSession(
    <SlotPhoto slot={cloches} photo={null} alt="Cloches" upload={upload} shrinker={shrinker} />,
  );

  fireEvent.drop(screen.getByRole("button"), dropEvent([jpeg()]));
  expect(await screen.findByRole("status")).toHaveTextContent("Préparation…");
  finish([new Blob(["j"])]);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Photo placée."));
});

test("two files, or a file that is not a photo, are refused with a message", async () => {
  setMockUser("demo.direction");
  const { shrinker, upload } = injected();
  await renderWithSession(
    <SlotPhoto slot={cloches} photo={null} alt="Cloches" upload={upload} shrinker={shrinker} />,
  );
  const add = screen.getByRole("button", { name: "Ajouter une photo — Cloches" });

  fireEvent.drop(add, dropEvent([jpeg("a.jpg"), jpeg("b.jpg")]));
  expect(await screen.findByRole("alert")).toHaveTextContent("Une seule photo à la fois.");

  fireEvent.drop(add, dropEvent([new File(["x"], "notes.txt", { type: "text/plain" })]));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Seule une photo peut être déposée ici.",
  );

  // A dragged link or text carries no file at all.
  fireEvent.drop(add, dropEvent([]));
  expect(screen.getByRole("alert")).toHaveTextContent("Seule une photo peut être déposée ici.");

  expect(shrinker).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

test("an upload the server refuses says why and places nothing", async () => {
  setMockUser("demo.direction");
  const puts = recordPuts();
  const { shrinker } = injected();
  const upload = vi.fn(async (_sizes: Blob[]): Promise<{ status: 200; id: number }> => {
    throw new ApiError(422, "validation_failed", "x");
  });
  await renderWithSession(
    <SlotPhoto slot={cloches} photo={null} alt="Cloches" upload={upload} shrinker={shrinker} />,
  );

  fireEvent.drop(screen.getByRole("button"), dropEvent([jpeg()]));

  expect(await screen.findByRole("alert")).toHaveTextContent("Le serveur a refusé cette photo.");
  expect(puts).toHaveLength(0);
});

test("a visitor's slot ignores a drop", async () => {
  setMockUser(null);
  const { shrinker, upload } = injected();
  const { container } = await renderWithSession(
    <SlotPhoto slot={cloches} photo={null} alt="Cloches" upload={upload} shrinker={shrinker} />,
  );

  const frame = container.querySelector<HTMLElement>("[data-photo-pending]");
  expect(frame).not.toBeNull();
  fireEvent.dragEnter(frame as HTMLElement, dropEvent([jpeg()]));
  fireEvent.drop(frame as HTMLElement, dropEvent([jpeg()]));

  expect(screen.queryByText("Déposer pour ajouter")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(shrinker).not.toHaveBeenCalled();
});

test("while an editor's slot is on the page, a file dropped beside it does not open in the tab", async () => {
  setMockUser("demo.direction");
  const { unmount } = await renderWithSession(
    <SlotPhoto slot={cloches} photo={null} alt="Cloches" />,
  );

  // fireEvent answers false when a listener called preventDefault().
  expect(fireEvent.dragOver(document.body, dropEvent([jpeg()]))).toBe(false);
  expect(fireEvent.drop(document.body, dropEvent([jpeg()]))).toBe(false);
  expect(screen.queryByRole("alert")).toBeEmptyDOMElement();
  // A dragged link or text keeps the browser's own behaviour.
  expect(fireEvent.drop(document.body, dropEvent([]))).toBe(true);

  unmount();
  expect(fireEvent.dragOver(document.body, dropEvent([jpeg()]))).toBe(true);
  expect(fireEvent.drop(document.body, dropEvent([jpeg()]))).toBe(true);
});

test("a visitor's page keeps the browser's own handling of a dropped file", async () => {
  setMockUser(null);
  await renderWithSession(<SlotPhoto slot={cloches} photo={null} alt="Cloches" />);

  expect(fireEvent.dragOver(document.body, dropEvent([jpeg()]))).toBe(true);
  expect(fireEvent.drop(document.body, dropEvent([jpeg()]))).toBe(true);
});
