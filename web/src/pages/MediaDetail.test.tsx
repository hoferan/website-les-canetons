import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";

import type { ImageResource } from "../api/generated/model";
import { ApiError } from "../api/http";
import type { Turn } from "../images/rotate";
import type { ReplaceFn } from "../images/useUploadQueue";
import { addUnusedMockImage, mockEntityTag, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { MediaDetail } from "./MediaDetail";

type Injected = {
  replacer?: ReplaceFn;
  rotator?: (url: string, turn: Turn) => Promise<Blob[]>;
  shrinker?: (file: File) => Promise<Blob[]>;
};

/** jsdom has no canvas and cannot send a multipart body, so every step that needs one is injected. */
async function renderDetail(id: number, injected: Injected = {}) {
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/media/:id" element={<MediaDetail {...injected} />} />
      <Route path="/media" element={<h1>Médiathèque</h1>} />
    </Routes>,
    { route: `/media/${id}` },
  );
  await screen.findByRole("heading", { level: 1, name: injectedName(id) });
}

const NAMES: Record<number, string> = {
  1: "Le groupe au Carnaval 2026",
  2: "Trompettes en répétition",
};
const injectedName = (id: number) => NAMES[id] ?? new RegExp(`^Photo inutilisée ${id}$`);

/** The mock's made-up digest of photo 1's largest size: its width, then its id. */
const LARGEST_OF_1 = `/api/v1/images/${"1600".padStart(8, "0")}${"1".padStart(56, "0")}.jpg`;
const TURNED_URL = `/api/v1/images/${"f".repeat(64)}.jpg`;

const actions = () => within(screen.getByRole("group", { name: "Actions sur la photo" }));

/** What the mock answers for an image, so an injected replacer can answer the same shape. */
async function shown(id: number): Promise<ImageResource> {
  return (await (await fetch(`/api/v1/images/${id}`)).json()) as ImageResource;
}

/** A replacer that answers the photo turned: new URL, swapped sides, a new tag. */
function fakeReplacer(calls: Array<{ id: number; sizes: Blob[]; etag: string }>): ReplaceFn {
  return async (id, sizes, etag) => {
    calls.push({ id, sizes, etag });
    const before = await shown(id);
    const data: ImageResource = {
      ...before,
      url: TURNED_URL,
      width: before.height,
      height: before.width,
    };
    return {
      data,
      status: 200,
      headers: new Headers({ ETag: mockEntityTag(data) }),
    };
  };
}

test("the page shows the photo large, its sizes, its date and every place it is shown", async () => {
  await renderDetail(1);

  const preview = screen.getByRole("img", { name: NAMES[1] });
  expect(preview).toHaveAttribute("src", LARGEST_OF_1);
  expect(preview.getAttribute("srcset")).toMatch(/480w, .*960w, .*1600w$/);

  expect(
    within(screen.getByTestId("photo-sizes"))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual([
    expect.stringMatching(/^1600 × 1067 px · \d+\sko$/),
    expect.stringMatching(/^960 × 640 px · \d+\sko$/),
    expect.stringMatching(/^480 × 320 px · \d+\sko$/),
  ]);
  expect(screen.getByText("Ajoutée le 26 septembre 2026")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Photo du groupe" })).toHaveAttribute("href", "/band");
  expect(screen.getByRole("link", { name: "← Retour aux médias" })).toHaveAttribute(
    "href",
    "/media",
  );
});

test("an unused photo says so", async () => {
  const id = addUnusedMockImage();
  await renderDetail(id);

  expect(screen.getByText("Non utilisée")).toBeInTheDocument();
});

test("the download link saves the largest size under the photo's name", async () => {
  await renderDetail(1);

  const download = actions().getByRole("link", { name: "Télécharger" });
  expect(download).toHaveAttribute("href", LARGEST_OF_1);
  expect(download).toHaveAttribute("download", "Le groupe au Carnaval 2026.jpg");
});

test("a rename sends the new name with the tag of the photo shown, and the page takes the answer", async () => {
  const user = userEvent.setup();
  await renderDetail(2);
  const tag = mockEntityTag(await shown(2));
  const sent: Array<{ ifMatch: string | null; body: unknown }> = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "PATCH") {
      void request
        .clone()
        .json()
        .then((body) => sent.push({ ifMatch: request.headers.get("If-Match"), body }));
    }
  });

  await user.click(actions().getByRole("button", { name: "Renommer" }));
  const field = screen.getByLabelText(/^Nom/);
  expect(field).toHaveValue(NAMES[2]);
  await user.clear(field);
  await user.type(field, "Trompettes, 2026");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(
    await screen.findByRole("heading", { level: 1, name: "Trompettes, 2026" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Nom enregistré.");
  expect(sent).toEqual([{ ifMatch: tag, body: { name: "Trompettes, 2026" } }]);
  server.events.removeAllListeners();
});

test("a second submit while the name is saving sends nothing", async () => {
  const user = userEvent.setup();
  await renderDetail(2);
  const before = await shown(2);
  let patches = 0;
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  // Held until both submits have happened, so the second one meets a save
  // that is still on its way.
  server.use(
    http.patch("/api/v1/images/2", async () => {
      patches++;
      await answered;
      const renamed = { ...before, name: "Encore" };
      return HttpResponse.json(renamed, { headers: { ETag: mockEntityTag(renamed) } });
    }),
  );

  await user.click(actions().getByRole("button", { name: "Renommer" }));
  const field = screen.getByLabelText(/^Nom/);
  await user.clear(field);
  await user.type(field, "Encore");
  const form = field.closest("form") as HTMLFormElement;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(patches).toBe(1));
  answer();

  expect(await screen.findByRole("heading", { level: 1, name: "Encore" })).toBeInTheDocument();
  expect(patches).toBe(1);
});

test("while the rename form is open, nothing else can change the photo", async () => {
  const user = userEvent.setup();
  await renderDetail(1);

  await user.click(actions().getByRole("button", { name: "Renommer" }));

  for (const name of [
    "Renommer",
    "Tourner à gauche",
    "Tourner à droite",
    "Remplacer",
    "Supprimer",
  ]) {
    expect(actions().getByRole("button", { name })).toBeDisabled();
  }
  await user.click(screen.getByRole("button", { name: "Annuler" }));
  expect(actions().getByRole("button", { name: "Tourner à gauche" })).toBeEnabled();
});

test("a write reads again what shows the photo, and nothing else", async () => {
  const user = userEvent.setup();
  await renderDetail(1, { rotator: async () => [new Blob(["x"])], replacer: fakeReplacer([]) });
  const reads: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "GET") reads.push(new URL(request.url).pathname);
  });

  await user.click(actions().getByRole("button", { name: "Tourner à droite" }));
  await screen.findByText("Photo tournée.");
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(reads.filter((path) => ["/api/v1/me", "/api/v1/config"].includes(path))).toEqual([]);
  server.events.removeAllListeners();
});

test("a blank name is refused next to the field and the name stays", async () => {
  const user = userEvent.setup();
  await renderDetail(2);

  await user.click(actions().getByRole("button", { name: "Renommer" }));
  await user.clear(screen.getByLabelText(/^Nom/));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText(/Nom est obligatoire/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: NAMES[2] })).toBeInTheDocument();
});

test.each<[Turn, string]>([
  ["left", "Tourner à gauche"],
  ["right", "Tourner à droite"],
])(
  "turning %s rotates the largest size and replaces the photo with the tag shown",
  async (turn, label) => {
    const user = userEvent.setup();
    const turned = [new Blob(["1067"]), new Blob(["533"])];
    const rotator = vi.fn(async () => turned);
    const calls: Array<{ id: number; sizes: Blob[]; etag: string }> = [];
    await renderDetail(1, { rotator, replacer: fakeReplacer(calls) });
    const tag = mockEntityTag(await shown(1));

    await user.click(actions().getByRole("button", { name: label }));

    expect(await screen.findByText("Photo tournée.")).toBeInTheDocument();
    expect(rotator).toHaveBeenCalledWith(LARGEST_OF_1, turn);
    expect(calls).toEqual([{ id: 1, sizes: turned, etag: tag }]);
    // The page shows what the replacement answered.
    expect(screen.getByRole("img", { name: NAMES[1] })).toHaveAttribute("src", TURNED_URL);
  },
);

test("a second action quotes the tag the first one answered, without a reload", async () => {
  const user = userEvent.setup();
  const calls: Array<{ id: number; sizes: Blob[]; etag: string }> = [];
  const replacer = fakeReplacer(calls);
  await renderDetail(1, { rotator: async () => [new Blob(["x"])], replacer });

  await user.click(actions().getByRole("button", { name: "Tourner à droite" }));
  await screen.findByText("Photo tournée.");
  await user.click(actions().getByRole("button", { name: "Tourner à droite" }));

  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1]?.etag).not.toBe(calls[0]?.etag);
});

test("while a rotation runs every action waits, and the page says what is happening", async () => {
  const user = userEvent.setup();
  let finish!: (sizes: Blob[]) => void;
  const rotator = () => new Promise<Blob[]>((resolve) => (finish = resolve));
  await renderDetail(1, { rotator, replacer: fakeReplacer([]) });

  await user.click(actions().getByRole("button", { name: "Tourner à gauche" }));

  expect(screen.getByRole("status")).toHaveTextContent("Rotation de la photo…");
  for (const name of [
    "Renommer",
    "Tourner à gauche",
    "Tourner à droite",
    "Remplacer",
    "Supprimer",
  ]) {
    expect(actions().getByRole("button", { name })).toBeDisabled();
  }
  finish([new Blob(["x"])]);
  expect(await screen.findByText("Photo tournée.")).toBeInTheDocument();
  expect(actions().getByRole("button", { name: "Tourner à gauche" })).toBeEnabled();
});

test("a failed replacement leaves the photo as it was and says why", async () => {
  const user = userEvent.setup();
  const replacer: ReplaceFn = async () => {
    throw new ApiError(409, "image_already_in_library", "Conflict");
  };
  const shrinker = vi.fn(async (file: File) => [file]);
  await renderDetail(1, { replacer, shrinker });

  const file = new File(["x"], "autre.jpg", { type: "image/jpeg" });
  await user.upload(screen.getByTestId("photo-replace-input"), file);

  // The page's alert region is always in the tree, empty until the failure
  // lands, so wait for its text.
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La photo n’a pas changé : Cette photo est déjà dans la photothèque.",
    ),
  );
  expect(shrinker).toHaveBeenCalledWith(file);
  expect(screen.getByRole("img", { name: NAMES[1] })).toHaveAttribute("src", LARGEST_OF_1);
});

test("a photo that cannot be turned is left as it was", async () => {
  const user = userEvent.setup();
  const replacer = vi.fn<ReplaceFn>();
  const { ShrinkError } = await import("../images/shrink");
  await renderDetail(1, {
    rotator: async () => {
      throw new ShrinkError("unreadable");
    },
    replacer,
  });

  await user.click(actions().getByRole("button", { name: "Tourner à droite" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(/^La photo n’a pas changé : /),
  );
  expect(replacer).not.toHaveBeenCalled();
});

test("deleting an unused photo asks first, then returns to the library", async () => {
  const user = userEvent.setup();
  const id = addUnusedMockImage();
  await renderDetail(id);

  await user.click(actions().getByRole("button", { name: "Supprimer" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Supprimer cette photo ?")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  expect(await screen.findByRole("heading", { name: "Médiathèque" })).toBeInTheDocument();
  expect((await fetch(`/api/v1/images/${id}`)).status).toBe(404);
});

test("deleting a photo that is shown says where, and offers no delete", async () => {
  const user = userEvent.setup();
  await renderDetail(2);

  await user.click(actions().getByRole("button", { name: "Supprimer" }));
  const dialog = await screen.findByRole("alertdialog");

  expect(within(dialog).getByText("Cette photo est encore affichée")).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: "Trompettes" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Supprimer" })).toBeNull();
  expect(within(dialog).getByRole("button", { name: "Fermer" })).toBeInTheDocument();
});

test("a delete the server refuses is shown in the dialog", async () => {
  const user = userEvent.setup();
  const id = addUnusedMockImage();
  server.use(
    http.delete(`/api/v1/images/${id}`, () =>
      HttpResponse.json(
        {
          title: "Conflict",
          status: 409,
          code: "image_in_use",
          instance: "",
          errors: [],
          requestId: "x",
          detail: "",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } },
      ),
    ),
  );
  await renderDetail(id);

  await user.click(actions().getByRole("button", { name: "Supprimer" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  await waitFor(() =>
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Cette photo est encore affichée sur le site.",
    ),
  );
});

test("on the German side the page speaks German", async () => {
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/media/:id" element={<MediaDetail />} />
    </Routes>,
    { route: "/media/1", locale: "de-CH" },
  );

  expect(await screen.findByRole("button", { name: "Nach links drehen" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Herunterladen" })).toBeInTheDocument();
});
