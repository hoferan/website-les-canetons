import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

import type { WebsiteExport200 } from "../api/generated/model";

/** The bundle's shape; see WebsiteController::FORMAT. */
export const BUNDLE_FORMAT = 1;

const SITE_FILE = "site.json";
const imagePath = (sha256: string) => `images/${sha256}.jpg`;

/** A website read from a bundle: the export's document and every size's bytes, by SHA-256. */
export type Bundle = { site: WebsiteExport200; files: Map<string, Uint8Array> };
export type BundleError = { reason: "not_a_bundle" | "unknown_format" | "missing_image" };

/**
 * One file holding a website (#336, ADR 0038): `site.json`, the export as the
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
  let site: WebsiteExport200;
  try {
    entries = unzipSync(zip);
    const raw = entries[SITE_FILE];
    if (!raw) return { reason: "not_a_bundle" };
    site = JSON.parse(strFromU8(raw)) as WebsiteExport200;
  } catch {
    return { reason: "not_a_bundle" };
  }

  if (site.format !== BUNDLE_FORMAT) return { reason: "unknown_format" };

  const files = new Map<string, Uint8Array>();
  for (const image of site.images ?? []) {
    for (const size of image.sizes) {
      const bytes = entries[imagePath(size.sha256)];
      if (!bytes) return { reason: "missing_image" };
      files.set(size.sha256, bytes);
    }
  }
  return { site, files };
}
