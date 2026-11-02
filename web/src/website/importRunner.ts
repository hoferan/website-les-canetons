import type { ImportWebsiteRequest, WebsiteImport200 } from "../api/generated/model";
import { ApiError } from "../api/http";
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  MAX_RETRY_AFTER_SECONDS,
  MIN_RETRY_AFTER_SECONDS,
  type UploadFn,
} from "../images/uploadQueue";
import type { Bundle } from "./bundle";

/** Why an import stopped before it changed anything. */
export class ImportRefused extends Error {
  constructor(readonly reason: "library_full" | "corrupt") {
    super(reason);
    this.name = "ImportRefused";
  }
}

export type ImportDeps = {
  /** How full the target library is (GET /images/summary). */
  summary: () => Promise<{
    count: number;
    capacity: number;
    bytesTotal: number;
    maxBytes: number;
  }>;
  /** The SHA-256 of every photo the target library holds. */
  librarySha256s: () => Promise<Set<string>>;
  upload: UploadFn;
  importSite: (body: ImportWebsiteRequest) => Promise<WebsiteImport200>;
  wait: (ms: number) => Promise<void>;
  onProgress: (done: number, total: number) => void;
};

/**
 * Sets this server's website up from a bundle (#336, ADR 0039), photos first.
 *
 * Each photo the library lacks goes up through the same upload as /media, one
 * request per photo, so none comes near the host's upload limit; the library
 * keeps its name and finds a photo it already holds by its SHA-256. Only then
 * is the rest sent, and the server replaces the texts, the slots and the
 * history in one go. A photo that fails stops the import before that step,
 * so the site is never left half replaced; the photos already uploaded stay
 * in the library, where a second run finds them.
 *
 * The room in the library, in photos and in bytes, is checked first, so a
 * bundle that cannot fit is refused before any upload.
 */
export async function runImport(bundle: Bundle, deps: ImportDeps): Promise<WebsiteImport200> {
  const { site, files } = bundle;
  // Every size is the file its name says, or nothing is sent: a size that is
  // not would be refused by the upload, after the photos before it.
  for (const image of site.images) {
    for (const size of image.sizes) {
      const bytes = files.get(size.sha256);
      if (!bytes || (await sha256Hex(bytes)) !== size.sha256) {
        throw new ImportRefused("corrupt");
      }
    }
  }

  const held = await deps.librarySha256s();
  const missing = site.images.filter((image) => !held.has(image.sha256));

  // Both caps the upload enforces: a photo past either would be refused half
  // way, after the ones before it had landed in the library.
  const { count, capacity, bytesTotal, maxBytes } = await deps.summary();
  const missingBytes = missing.reduce(
    (sum, image) =>
      sum + image.sizes.reduce((total, size) => total + (files.get(size.sha256)?.length ?? 0), 0),
    0,
  );
  if (count + missing.length > capacity || bytesTotal + missingBytes > maxBytes) {
    throw new ImportRefused("library_full");
  }

  deps.onProgress(0, missing.length);
  for (const [index, image] of missing.entries()) {
    // Largest first, as the upload expects them.
    const sizes = [...image.sizes]
      .sort((a, b) => b.width - a.width)
      .map(
        (size) =>
          new Blob([files.get(size.sha256) as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }),
      );
    await uploadWithRetry(deps, sizes, image.name);
    deps.onProgress(index + 1, missing.length);
  }

  // The export documents a history row's precision and icon as plain
  // strings, the import as its closed sets; the server checks them either way.
  return deps.importSite({
    format: site.format,
    texts: site.texts,
    // Only a register's photo names its register; the import refuses the
    // field anywhere else.
    slots: site.slots.map(({ registerName, ...slot }) =>
      registerName === null ? slot : { ...slot, registerName },
    ),
    history: site.history as ImportWebsiteRequest["history"],
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The upload is throttled per account; a 429 waits as the server asks, then tries again. */
async function uploadWithRetry(deps: ImportDeps, sizes: Blob[], name: string): Promise<void> {
  for (;;) {
    try {
      await deps.upload(sizes, name);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429) throw error;
      const seconds = Math.min(
        MAX_RETRY_AFTER_SECONDS,
        Math.max(MIN_RETRY_AFTER_SECONDS, error.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS),
      );
      await deps.wait(seconds * 1000);
    }
  }
}
