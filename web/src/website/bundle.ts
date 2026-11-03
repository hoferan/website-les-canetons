import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

import type { WebsiteExport200 } from "../api/generated/model";

/** The bundle's shape; see WebsiteController::FORMAT. Format 1 carried single texts. */
export const BUNDLE_FORMAT = 2;

const SITE_FILE = "site.json";
const imagePath = (sha256: string) => `images/${sha256}.jpg`;

/**
 * The export's document as a file holds it. A format 2 file written before
 * the export named its server has no `exportedFrom`; it reads the same.
 */
export type BundledSite = Omit<WebsiteExport200, "exportedFrom"> & { exportedFrom?: string };

/** A website read from a bundle: the export's document and every size's bytes, by SHA-256. */
export type Bundle = { site: BundledSite; files: Map<string, Uint8Array> };
export type BundleError = { reason: "not_a_bundle" | "unknown_format" | "missing_image" };

/**
 * One file holding a website (#336, ADR 0039): `site.json`, the export as the
 * server wrote it, and `images/<sha256>.jpg` for every stored size of every
 * photo, named by the digest of its bytes.
 *
 * Stored, not compressed: the photos are JPEGs already, and compressing them
 * again costs time for nothing.
 */
export async function buildBundle(
  site: WebsiteExport200,
  fetchBytes: (url: string) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const files: Zippable = { [SITE_FILE]: strToU8(JSON.stringify(site, null, 2)) };
  // One size at a time: the library can hold 150 MB, and the server serves
  // each size on its own anyway.
  for (const image of site.images) {
    for (const size of image.sizes) {
      files[imagePath(size.sha256)] = await fetchBytes(size.url);
    }
  }
  return zipSync(files, { level: 0 });
}

/**
 * Reads a bundle, or says why the file is not one. Every size `site.json`
 * lists must be in the file, so an import never starts on a bundle that would
 * fail half way through its photos.
 */
export function readBundle(zip: Uint8Array): Bundle | BundleError {
  let entries: Record<string, Uint8Array>;
  let parsed: unknown;
  try {
    entries = unzipSync(zip);
    const raw = entries[SITE_FILE];
    if (!raw) return { reason: "not_a_bundle" };
    parsed = JSON.parse(strFromU8(raw));
  } catch {
    return { reason: "not_a_bundle" };
  }

  if (!isRecord(parsed)) return { reason: "not_a_bundle" };
  // Before the shape: a format 1 file has no `blocks` and says why it is refused.
  if (parsed.format !== BUNDLE_FORMAT) return { reason: "unknown_format" };
  if (!hasSiteShape(parsed)) return { reason: "not_a_bundle" };
  const site = parsed;

  const files = new Map<string, Uint8Array>();
  for (const image of site.images) {
    for (const size of image.sizes) {
      const bytes = entries[imagePath(size.sha256)];
      if (!bytes) return { reason: "missing_image" };
      files.set(size.sha256, bytes);
    }
  }
  return { site, files };
}

/**
 * Whether `site.json` has what the page reads before the import: the date and
 * the host it shows, the lists it counts, and each photo's sizes. A
 * hand-edited file missing one would otherwise throw while the page renders.
 * Each row is the server's to check on import.
 */
function hasSiteShape(
  site: Record<string, unknown>,
): site is BundledSite & Record<string, unknown> {
  const { exportedAt, exportedFrom, blocks, images, slots, history } = site;
  return (
    typeof exportedAt === "string" &&
    !Number.isNaN(Date.parse(exportedAt)) &&
    (exportedFrom === undefined || typeof exportedFrom === "string") &&
    Array.isArray(blocks) &&
    Array.isArray(slots) &&
    Array.isArray(history) &&
    Array.isArray(images) &&
    images.every(
      (image) =>
        isRecord(image) &&
        typeof image.sha256 === "string" &&
        typeof image.name === "string" &&
        Array.isArray(image.sizes) &&
        image.sizes.every(
          (size) =>
            isRecord(size) && typeof size.sha256 === "string" && typeof size.width === "number",
        ),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
