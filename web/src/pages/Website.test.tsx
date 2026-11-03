import { createHash } from "node:crypto";

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strToU8, zipSync } from "fflate";
import { HttpResponse, http } from "msw";
import { expect, test, vi } from "vitest";

import type { WebsiteExport200 } from "../api/generated/model";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import type { UploadFn } from "../images/uploadQueue";
import { Website } from "./Website";

/**
 * /website: the whole public site, carried from one server to another
 * (#336). jsdom cannot send a multipart body, so the photo upload is injected.
 */

/** The photo's one size, named by the digest of its bytes as on the server. */
const PHOTO_BYTES = "jpeg bytes";
const SHA = createHash("sha256").update(PHOTO_BYTES).digest("hex");
const SITE: WebsiteExport200 = {
  format: 2,
  exportedAt: "2026-11-02T10:00:00+00:00",
  blocks: [{ key: "committee.contact", data: { phone: "026 000 00 03" } }],
  images: [
    {
      sha256: SHA,
      name: "Le groupe",
      sizes: [{ width: 800, height: 600, sha256: SHA, url: `/api/v1/images/${SHA}.jpg` }],
    },
  ],
  slots: [
    { slot: "register-9", sha256: SHA, label: "Tubas", path: "/band", registerName: "Tubas" },
  ],
  history: [],
};

/**
 * Files by name, with the bytes the page reads for each. jsdom's File turns
 * a typed array from Node's realm into text, so the page's reader is
 * replaced by a lookup here.
 */
const contents = new Map<string, Uint8Array>();

/**
 * Bytes in Node's own Uint8Array. Under jsdom, strToU8 answers one from
 * jsdom's TextEncoder, another realm, and zipSync then takes it for a folder.
 */
const u8 = (text: string) => Uint8Array.from(strToU8(text));
const readFile = async (file: File) => contents.get(file.name)!;

function bundleFile(site: unknown = SITE, withImage = true): File {
  const files: Record<string, Uint8Array> = { "site.json": u8(JSON.stringify(site)) };
  if (withImage) files[`images/${SHA}.jpg`] = u8(PHOTO_BYTES);
  contents.set("site.zip", zipSync(files));
  return new File(["zip"], "site.zip", { type: "application/zip" });
}

function otherZip(): File {
  contents.set("x.zip", zipSync({ "x.txt": u8("x") }));
  return new File(["zip"], "x.zip", { type: "application/zip" });
}

/** An upload that puts the photo in the mock's library under the bundle's SHA-256. */
const fakeUpload: UploadFn = async () => ({ status: 201, id: 1 });

test("the export button downloads a zip", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  const created = vi.fn((_blob: Blob | MediaSource) => "blob:site");
  vi.spyOn(URL, "createObjectURL").mockImplementation(created);
  const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const clicked: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  });
  await renderWithSession(<Website />, { route: "/website" });

  await user.click(screen.getByRole("button", { name: "Télécharger le site" }));

  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(clicked[0]).toMatch(/^site-.+-\d{4}-\d{2}-\d{2}\.zip$/);
  expect((created.mock.calls[0]![0] as Blob).type).toBe("application/zip");
  // Revoked at once, the link can cancel the download it just started in
  // some browsers.
  expect(revoked).not.toHaveBeenCalled();
});

test("a photo the server fails to send fails the export, and nothing is saved", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  server.use(
    http.get("/api/v1/website/export", () => HttpResponse.json(SITE)),
    http.get("/api/v1/images/:file", () => new HttpResponse("gone", { status: 404 })),
  );
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await renderWithSession(<Website />, { route: "/website" });

  await user.click(screen.getByRole("button", { name: "Télécharger le site" }));

  expect(
    await screen.findByText("Le site n’a pas pu être exporté. Réessayez."),
  ).toBeInTheDocument();
  expect(clicked).not.toHaveBeenCalled();
});

test("a file shows what it holds before anything is replaced", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  let imported = false;
  server.use(
    http.post("/api/v1/website/import", () => {
      imported = true;
      return HttpResponse.json({});
    }),
  );
  await renderWithSession(<Website upload={fakeUpload} readFile={readFile} />, {
    route: "/website",
  });

  await user.upload(screen.getByLabelText("Fichier du site"), bundleFile());

  const summary = await screen.findByRole("region", { name: "Contenu du fichier" });
  expect(summary).toHaveTextContent("1 bloc de contenu");
  expect(summary).toHaveTextContent("1 photo");
  expect(imported).toBe(false);
});

test("import replaces the site after the typed confirmation, and names a skipped register photo", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  const bodies: unknown[] = [];
  server.use(
    http.get("/api/v1/website/export", () =>
      HttpResponse.json({ ...SITE, blocks: [], images: [], slots: [] }),
    ),
    http.post("/api/v1/website/import", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({
        blocks: 1,
        slots: 0,
        history: 0,
        skipped: [{ slot: "register-9", registerName: "Tubas" }],
      });
    }),
  );
  await renderWithSession(<Website upload={fakeUpload} readFile={readFile} />, {
    route: "/website",
  });

  await user.upload(screen.getByLabelText("Fichier du site"), bundleFile());
  await user.click(await screen.findByRole("button", { name: "Remplacer le site" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.type(within(dialog).getByRole("textbox"), "REMPLACER");
  await user.click(within(dialog).getByRole("button", { name: "Remplacer le site" }));

  const importCard = screen.getByRole("region", { name: "Importer un site" });
  const result = within(importCard).getByRole("status");
  await waitFor(() => expect(result).toHaveTextContent("Site importé"));
  expect(result).toHaveTextContent("Tubas");
  expect(bodies).toHaveLength(1);
});

test("a format 1 bundle is refused as unknown_format and nothing is uploaded", async () => {
  // Format 1 held single texts, from before the content blocks.
  const user = userEvent.setup();
  setMockUser("demo.direction");
  const upload = vi.fn(fakeUpload);
  let imported = false;
  server.use(
    http.post("/api/v1/website/import", () => {
      imported = true;
      return HttpResponse.json({});
    }),
  );
  const formatOne = {
    ...SITE,
    format: 1,
    blocks: undefined,
    texts: [{ key: "join.intro", fr: "Bonjour", de: null }],
  };
  await renderWithSession(<Website upload={upload} readFile={readFile} />, { route: "/website" });

  await user.upload(screen.getByLabelText("Fichier du site"), bundleFile(formatOne));

  expect(
    await screen.findByText(
      "Ce fichier vient d’une autre version du site et ne peut pas être lu ici.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remplacer le site" })).toBeNull();
  expect(upload).not.toHaveBeenCalled();
  expect(imported).toBe(false);
});

test("a file that is not a site is refused in French, and nothing is sent", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<Website upload={fakeUpload} readFile={readFile} />, {
    route: "/website",
  });

  await user.upload(screen.getByLabelText("Fichier du site"), otherZip());

  expect(await screen.findByText(/n’est pas un fichier de site/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remplacer le site" })).toBeNull();
});
