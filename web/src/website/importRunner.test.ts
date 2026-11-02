// @vitest-environment node
// Node, not jsdom: jsdom's Blob has no arrayBuffer().
import { createHash } from "node:crypto";

import { strToU8 } from "fflate";
import { expect, test, vi } from "vitest";

import type { ImportWebsiteRequest, WebsiteExport200 } from "../api/generated/model";
import { ApiError } from "../api/http";
import type { Bundle } from "./bundle";
import { ImportRefused, runImport, type ImportDeps } from "./importRunner";

/** The digest of a size's bytes, which names it, as on the server. */
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytesFor = (c: string, width: number) => strToU8(`/x/${c}${width}.jpg`);
/** A photo is named by its largest size's digest. */
const sha = (c: string) => digest(bytesFor(c, 800));

function bundleOf(photos: string[]): Bundle {
  const site: WebsiteExport200 = {
    format: 1,
    exportedAt: "2026-11-02T10:00:00+00:00",
    texts: [{ key: "join.intro", fr: "Bonjour", de: null }],
    images: photos.map((c) => ({
      sha256: sha(c),
      name: `Photo ${c}`,
      sizes: [
        { width: 800, height: 600, sha256: sha(c), url: `/x/${c}800.jpg` },
        { width: 480, height: 360, sha256: digest(bytesFor(c, 480)), url: `/x/${c}480.jpg` },
      ],
    })),
    slots: photos.map((c) => ({
      slot: `slot-${c}`,
      sha256: sha(c),
      label: null,
      path: null,
      registerName: null,
    })),
    history: [],
  };
  const files = new Map<string, Uint8Array>();
  for (const image of site.images) {
    for (const size of image.sizes) files.set(size.sha256, strToU8(size.url));
  }
  return { site, files };
}

function deps(
  overrides: Partial<ImportDeps> = {},
): ImportDeps & { uploads: string[]; imported: ImportWebsiteRequest[] } {
  const uploads: string[] = [];
  const imported: ImportWebsiteRequest[] = [];
  return {
    uploads,
    imported,
    summary: async () => ({ count: 0, capacity: 100, bytesTotal: 0, maxBytes: 1_000_000 }),
    librarySha256s: async () => new Set<string>(),
    upload: async (_sizes, name) => {
      uploads.push(name);
      return { status: 201, id: uploads.length };
    },
    importSite: async (body) => {
      imported.push(body);
      return {
        texts: body.texts.length,
        slots: body.slots.length,
        history: body.history.length,
        skipped: [],
      };
    },
    wait: async () => {},
    onProgress: () => {},
    ...overrides,
  };
}

test("uploads only the photos the library lacks, then imports", async () => {
  const d = deps({ librarySha256s: async () => new Set([sha("a")]) });

  const result = await runImport(bundleOf(["a", "b"]), d);

  expect(d.uploads).toEqual(["Photo b"]);
  expect(d.imported).toHaveLength(1);
  expect(d.imported[0]).toEqual({
    format: 1,
    texts: [{ key: "join.intro", fr: "Bonjour", de: null }],
    slots: bundleOf(["a", "b"]).site.slots.map(({ registerName: _none, ...slot }) => slot),
    history: [],
  });
  expect(result.slots).toBe(2);
});

test("each upload sends every size, largest first", async () => {
  const sent: number[][] = [];
  const d = deps({
    upload: async (sizes) => {
      sent.push(
        await Promise.all(sizes.map(async (size) => (await size.arrayBuffer()).byteLength)),
      );
      return { status: 201, id: 1 };
    },
  });

  await runImport(bundleOf(["a"]), d);

  expect(sent).toEqual([[strToU8("/x/a800.jpg").length, strToU8("/x/a480.jpg").length]]);
});

test("too many new photos are refused before any upload", async () => {
  const d = deps({
    summary: async () => ({ count: 99, capacity: 100, bytesTotal: 0, maxBytes: 1_000_000 }),
  });

  await expect(runImport(bundleOf(["a", "b"]), d)).rejects.toEqual(
    new ImportRefused("library_full"),
  );
  expect(d.uploads).toEqual([]);
  expect(d.imported).toEqual([]);
});

test("photos too heavy for the room left are refused before any upload", async () => {
  // Each photo here is two sizes of about 12 bytes; 30 bytes of room is not
  // enough for two photos, though the count would allow it.
  const d = deps({
    summary: async () => ({ count: 0, capacity: 100, bytesTotal: 970, maxBytes: 1000 }),
  });

  await expect(runImport(bundleOf(["a", "b"]), d)).rejects.toEqual(
    new ImportRefused("library_full"),
  );
  expect(d.uploads).toEqual([]);
});

test("a photo whose bytes do not match its name is refused before any upload", async () => {
  const bundle = bundleOf(["a", "b"]);
  bundle.files.set(sha("b"), strToU8("an error page, not a photo"));
  const d = deps();

  await expect(runImport(bundle, d)).rejects.toEqual(new ImportRefused("corrupt"));
  expect(d.uploads).toEqual([]);
});

test("a throttled upload waits and goes on", async () => {
  let calls = 0;
  const waited: number[] = [];
  const d = deps({
    upload: async () => {
      calls += 1;
      if (calls === 1) throw new ApiError(429, "rate_limited", "Too many", [], undefined, 7);
      return { status: 201, id: calls };
    },
    wait: async (ms) => {
      waited.push(ms);
    },
  });

  await runImport(bundleOf(["a"]), d);

  expect(waited).toEqual([7000]);
  expect(calls).toBe(2);
  expect(d.imported).toHaveLength(1);
});

test("a failed upload stops before the import", async () => {
  const d = deps({
    upload: vi.fn(async () => {
      throw new ApiError(409, "image_library_full", "Full", []);
    }),
  });

  await expect(runImport(bundleOf(["a"]), d)).rejects.toBeInstanceOf(ApiError);
  expect(d.imported).toEqual([]);
});

test("progress counts the photos as they go", async () => {
  const progress: Array<[number, number]> = [];
  const d = deps({ onProgress: (done, total) => progress.push([done, total]) });

  await runImport(bundleOf(["a", "b"]), d);

  expect(progress).toEqual([
    [0, 2],
    [1, 2],
    [2, 2],
  ]);
});
