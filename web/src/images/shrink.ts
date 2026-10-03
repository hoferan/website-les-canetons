/**
 * Shrinks a photo in the browser before it is uploaded (#105).
 *
 * A phone camera original runs to 5-20 MB and the server accepts 600 KB a
 * size, so the work happens here: decode once, then scale and re-encode as
 * JPEG at up to three sizes, 1920, 960 and 480 px on the longest edge, for the
 * page to pick from with `srcset`. Drawing through a canvas drops the
 * original's EXIF, GPS position included, so no photo in the library reveals
 * where it was taken. WebKit's encoder may write a small Exif segment of its
 * own, so the encoded bytes are scrubbed of every segment the server's
 * allow-list refuses before they go anywhere.
 *
 * These limits are repeated in api/config/api.php (read by JpegInspector) and
 * tools/image-budget.mjs. Change all three together.
 */

export const MAX_EDGE = 1920;
/** The longest edge of each size, largest first. The first is MAX_EDGE. */
export const SIZE_EDGES = [MAX_EDGE, 960, 480] as const;
export const MAX_BYTES = 614_400;
export const START_QUALITY = 0.82;
export const QUALITY_STEP = 0.07;
export const MIN_QUALITY = 0.6;

export type ShrinkReason = "unreadable" | "unsupported" | "too_large";

export class ShrinkError extends Error {
  constructor(readonly reason: ShrinkReason) {
    super(reason);
    this.name = "ShrinkError";
  }
}

/** Fits the longest edge to `maxEdge`, keeps the aspect ratio, never upscales. */
export function targetSize(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * The sizes to encode for a source of the given dimensions, largest first.
 *
 * Never upscales: a source smaller than a target gets its own size instead of
 * the larger ones, plus every smaller target. So 4000 px gives 1920, 960 and
 * 480; 700 px gives 700 and 480; 400 px gives 400 alone. Every size has a
 * different width and at least one pixel on each edge, which the server
 * checks.
 */
export function plannedSizes(
  width: number,
  height: number,
): Array<{ width: number; height: number }> {
  const longest = Math.max(width, height);
  const edges: number[] = SIZE_EDGES.filter((edge) => edge < longest);
  edges.unshift(Math.min(longest, MAX_EDGE));

  const sizes: Array<{ width: number; height: number }> = [];
  for (const edge of edges) {
    const size = targetSize(width, height, edge);
    if (size.width < 1 || size.height < 1) continue;
    if (sizes.some((kept) => kept.width === size.width)) continue;
    sizes.push(size);
  }
  return sizes;
}

/** 0.82, 0.75, 0.68, 0.61, then the floor. Rounded so 0.61 is not 0.6100000000000001. */
function qualities(): number[] {
  const steps: number[] = [];
  for (let q = START_QUALITY; q > MIN_QUALITY; q -= QUALITY_STEP) {
    steps.push(Math.round(q * 100) / 100);
  }
  steps.push(MIN_QUALITY);
  return steps;
}

const encoder = new TextEncoder();

/**
 * The APPn segments JpegInspector accepts, by marker, with the identifier each
 * must start with: JFIF, an ICC profile and Adobe's colour transform. Every
 * other APPn is metadata to the server, Exif and XMP included.
 */
const KEPT_APP: Record<number, number[]> = {
  0xe0: [...encoder.encode("JFIF"), 0x00],
  0xe2: [...encoder.encode("ICC_PROFILE"), 0x00],
  0xee: [...encoder.encode("Adobe")],
};

function startsWith(bytes: Uint8Array, at: number, head: number[]): boolean {
  return head.every((value, i) => bytes[at + i] === value);
}

/** Whether JpegInspector would refuse this segment as metadata: a comment, or an APPn it does not keep. */
function isMetadata(bytes: Uint8Array, marker: number, payloadAt: number): boolean {
  if (marker === 0xfe) return true;
  if (marker < 0xe0 || marker > 0xef) return false;
  const head = KEPT_APP[marker];
  return head === undefined || !startsWith(bytes, payloadAt, head);
}

/**
 * Removes every comment and every APPn segment the server's allow-list would
 * refuse, walking the markers from SOI to SOS without decoding anything (the
 * rules of JpegInspector on the server). Returns the input itself when there
 * is nothing to remove or the structure is not what a JPEG header looks like.
 */
export function stripMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  const cuts: Array<[number, number]> = [];
  let i = 2;
  for (;;) {
    if (i >= bytes.length || bytes[i] !== 0xff) return bytes;
    while (bytes[i] === 0xff) i += 1; // fill bytes may pad before a marker
    if (i >= bytes.length) return bytes;
    const marker = bytes[i] as number;
    const start = i - 1;
    i += 1;
    if (marker === 0xda || marker === 0xd9) break; // SOS or EOI: the headers are over
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;

    if (i + 2 > bytes.length) return bytes;
    const length = ((bytes[i] as number) << 8) | (bytes[i + 1] as number);
    if (length < 2 || i + length > bytes.length) return bytes;
    if (isMetadata(bytes, marker, i + 2)) {
      cuts.push([start, i + length]);
    }
    i += length;
  }

  if (cuts.length === 0) return bytes;
  const removed = cuts.reduce((sum, [from, to]) => sum + to - from, 0);
  const out = new Uint8Array(bytes.length - removed);
  let read = 0;
  let write = 0;
  for (const [from, to] of cuts) {
    out.set(bytes.subarray(read, from), write);
    write += from - read;
    read = to;
  }
  out.set(bytes.subarray(read), write);
  return out;
}

/** FileReader rather than Blob.arrayBuffer(), which jsdom lacks. */
function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function scrub(blob: Blob): Promise<Blob> {
  const bytes = await readBytes(blob);
  const clean = stripMetadata(bytes);
  return clean === bytes ? blob : new Blob([clean.buffer as ArrayBuffer], { type: blob.type });
}

/** Encodes at falling quality until the result fits `maxBytes`; gives up at the floor. */
export async function encodeWithinBudget(
  encode: (quality: number) => Promise<Blob>,
  maxBytes = MAX_BYTES,
): Promise<Blob> {
  for (const quality of qualities()) {
    const blob = await scrub(await encode(quality));
    if (blob.size <= maxBytes) return blob;
  }
  throw new ShrinkError("too_large");
}

/**
 * What a size is drawn from: a decoded photo, or the canvas a rotation drew
 * it on. Anything a canvas can draw that knows its own pixel size.
 */
export type PhotoSource = CanvasImageSource & { readonly width: number; readonly height: number };

/**
 * Decodes a photo once, for every size to be drawn from. The caller closes
 * the bitmap: a hundred photos in a row exhaust a phone's memory if each
 * decoded bitmap waits for the garbage collector.
 */
export async function decodePhoto(blob: Blob): Promise<ImageBitmap> {
  try {
    // "from-image" applies the EXIF orientation while decoding. The canvas then
    // loses the tag, so without this a portrait phone photo would arrive sideways.
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new ShrinkError("unreadable");
  }
}

/**
 * Every size of a photo as a JPEG, largest first (see plannedSizes()).
 *
 * The one encoding pipeline: an upload, a replacement and a rotation all end
 * here, so every photo the library holds was made by the same sizes, quality
 * steps and metadata scrub. Each canvas is released as soon as its JPEG
 * exists, so at most one is alive beside the source.
 */
export async function encodeSizes(source: PhotoSource): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const { width, height } of plannedSizes(source.width, source.height)) {
    blobs.push(await encodeSize(source, width, height));
  }
  return blobs;
}

/** Every size of a photo file, decoded once and drawn from that one bitmap. */
export async function shrink(file: File): Promise<Blob[]> {
  // An SVG decodes in some browsers and carries script and external references.
  // It is not a photograph, so it never reaches the canvas.
  if (file.type === "image/svg+xml") throw new ShrinkError("unsupported");

  const bitmap = await decodePhoto(file);
  try {
    return await encodeSizes(bitmap);
  } finally {
    bitmap.close();
  }
}

/** Draws one size from the source, encodes it, and releases the canvas. */
async function encodeSize(source: PhotoSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ShrinkError("unreadable");
    context.imageSmoothingQuality = "high";
    // JPEG has no alpha: a transparent PNG would otherwise turn black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    return await encodeWithinBudget(
      (quality) =>
        new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new ShrinkError("unreadable"))),
            "image/jpeg",
            quality,
          );
        }),
    );
  } finally {
    // A canvas's backing store is freed only when its size drops to zero or
    // the collector gets to it, and a phone has little to spare.
    canvas.width = 0;
    canvas.height = 0;
  }
}
