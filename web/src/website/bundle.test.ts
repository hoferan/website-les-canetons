// @vitest-environment node
// Node, not jsdom: jsdom's TextDecoder refuses a Uint8Array made in another
// realm, which no browser does.
import { strToU8, zipSync } from "fflate";
import { expect, test } from "vitest";

import type { WebsiteExport200 } from "../api/generated/model";
import { buildBundle, readBundle } from "./bundle";

const SITE: WebsiteExport200 = {
  format: 2,
  exportedAt: "2026-11-02T10:00:00+00:00",
  exportedFrom: "test.lescanetons.ch",
  blocks: [{ key: "committee.contact", data: { phone: "026 000 00 03", email: "" } }],
  images: [
    {
      sha256: "a".repeat(64),
      name: "Le groupe",
      sizes: [
        {
          width: 800,
          height: 600,
          sha256: "b".repeat(64),
          url: `/api/v1/images/${"b".repeat(64)}.jpg`,
        },
        {
          width: 480,
          height: 360,
          sha256: "c".repeat(64),
          url: `/api/v1/images/${"c".repeat(64)}.jpg`,
        },
      ],
    },
  ],
  slots: [
    { slot: "band", sha256: "a".repeat(64), label: "Le groupe", path: "/band", registerName: null },
  ],
  history: [],
};

const bytesOf = (url: string) => new Uint8Array(strToU8(`bytes of ${url}`));

test("a bundle read back gives the same site and every size's bytes", async () => {
  const fetched: string[] = [];
  const zip = await buildBundle(SITE, async (url) => {
    fetched.push(url);
    return bytesOf(url);
  });

  const bundle = readBundle(zip);
  if ("reason" in bundle) throw new Error(bundle.reason);

  expect(bundle.site).toEqual(SITE);
  expect(fetched).toEqual(SITE.images[0]!.sizes.map((size) => size.url));
  for (const size of SITE.images[0]!.sizes) {
    expect(bundle.files.get(size.sha256)).toEqual(bytesOf(size.url));
  }
});

test("a zip without site.json is not a bundle", () => {
  const zip = zipSync({ "other.txt": strToU8("hello") });

  expect(readBundle(zip)).toEqual({ reason: "not_a_bundle" });
});

test("a file that is not a zip is not a bundle", () => {
  expect(readBundle(strToU8("just text"))).toEqual({ reason: "not_a_bundle" });
});

test("a format 1 bundle, which carried single texts, is refused", () => {
  // JSON drops the undefined `blocks`, as a format 1 file has none.
  const old = {
    ...SITE,
    format: 1,
    blocks: undefined,
    texts: [{ key: "join.intro", fr: "Bonjour", de: null }],
  };
  const zip = zipSync({ "site.json": strToU8(JSON.stringify(old)) });

  expect(readBundle(zip)).toEqual({ reason: "unknown_format" });
});

test("a size listed but missing from images/ is refused", () => {
  const zip = zipSync({ "site.json": strToU8(JSON.stringify(SITE)) });

  expect(readBundle(zip)).toEqual({ reason: "missing_image" });
});

test("a format 2 file from before the server was named is still read", () => {
  const older: Partial<WebsiteExport200> = { ...SITE };
  delete older.exportedFrom;
  const zip = zipSync({
    "site.json": strToU8(JSON.stringify(older)),
    ...Object.fromEntries(
      SITE.images[0]!.sizes.map((size) => [`images/${size.sha256}.jpg`, bytesOf(size.url)]),
    ),
  });

  const bundle = readBundle(zip);
  if ("reason" in bundle) throw new Error(bundle.reason);

  expect(bundle.site.exportedFrom).toBeUndefined();
  expect(bundle.site.blocks).toEqual(SITE.blocks);
});

// A hand-edited site.json the page would otherwise read while it renders the
// summary: formatDay throws on a missing date, `.length` on a missing list.
test.each<[string, (site: Record<string, unknown>) => unknown]>([
  ["no exportedAt", ({ exportedAt: _, ...site }) => site],
  ["an exportedAt that is no date", (site) => ({ ...site, exportedAt: "hier" })],
  ["no blocks", ({ blocks: _, ...site }) => site],
  ["blocks that are no list", (site) => ({ ...site, blocks: {} })],
  ["no slots", ({ slots: _, ...site }) => site],
  ["no history", ({ history: _, ...site }) => site],
  ["no images", ({ images: _, ...site }) => site],
  ["a photo without sizes", (site) => ({ ...site, images: [{ sha256: "a", name: "x" }] })],
  ["an exportedFrom that is no text", (site) => ({ ...site, exportedFrom: 7 })],
  ["a document that is no object", () => null],
])("a site.json with %s is not a bundle", (_label, edit) => {
  const zip = zipSync({
    "site.json": strToU8(JSON.stringify(edit({ ...SITE }))),
    ...Object.fromEntries(
      SITE.images[0]!.sizes.map((size) => [`images/${size.sha256}.jpg`, bytesOf(size.url)]),
    ),
  });

  expect(readBundle(zip)).toEqual({ reason: "not_a_bundle" });
});
