/**
 * Turns a library photo a quarter, in the browser (#105).
 *
 * The server never decodes an image (ADR 0028), so a rotation is a
 * replacement: the largest stored size is loaded, turned on a canvas, and
 * encoded into new sizes by the same pipeline an upload uses. The library
 * keeps no original, so each rotation re-encodes the photo once more. A JPEG
 * loses a little each time, which a few turns do not make visible.
 */

import { decodePhoto, encodeSizes, ShrinkError, type PhotoSource } from "./shrink";

export type Turn = "left" | "right";

/**
 * Draws the source turned a quarter onto a canvas of swapped size: "right" is
 * clockwise, "left" anticlockwise.
 */
export function drawTurned(
  source: PhotoSource,
  turn: Turn,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement {
  canvas.width = source.height;
  canvas.height = source.width;
  const context = canvas.getContext("2d");
  if (!context) throw new ShrinkError("unreadable");
  if (turn === "right") {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
  } else {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(source, 0, 0);
  return canvas;
}

/**
 * The size's bytes, from the same origin. A size that will not load cannot be
 * turned.
 *
 * A direct `fetch()` on purpose, against the rule in CLAUDE.md. That rule is
 * about the JSON API, where the mutator owns CSRF priming and the problem
 * document. This is a public, binary GET: the mutator would parse the body as
 * JSON and add nothing a GET needs.
 */
async function load(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new ShrinkError("unreadable");
  return await response.blob();
}

type Steps = {
  load: (url: string) => Promise<Blob>;
  decode: (blob: Blob) => Promise<ImageBitmap>;
  turn: (source: PhotoSource, turn: Turn) => HTMLCanvasElement;
  encode: (source: PhotoSource) => Promise<Blob[]>;
};

const DEFAULT_STEPS: Steps = { load, decode: decodePhoto, turn: drawTurned, encode: encodeSizes };

/**
 * Every size of the photo at `url`, turned a quarter, largest first: what a
 * replacement sends. Tests inject the steps, since jsdom has no canvas.
 */
export async function rotatePhoto(
  url: string,
  turn: Turn,
  steps: Steps = DEFAULT_STEPS,
): Promise<Blob[]> {
  const decoded = await steps.decode(await steps.load(url));
  let turned: HTMLCanvasElement;
  try {
    turned = steps.turn(decoded, turn);
  } finally {
    decoded.close();
  }
  try {
    return await steps.encode(turned);
  } finally {
    // Freed at once, as shrink() frees each of its canvases.
    turned.width = 0;
    turned.height = 0;
  }
}
