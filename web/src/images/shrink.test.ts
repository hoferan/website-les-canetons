import { afterEach, describe, expect, it, vi } from "vitest";

import {
  encodeWithinBudget,
  MAX_BYTES,
  plannedSizes,
  shrink,
  ShrinkError,
  stripMetadata,
  targetSize,
} from "./shrink";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("targetSize", () => {
  it("fits a landscape original to 1920 on the long edge", () => {
    expect(targetSize(6048, 4024)).toEqual({ width: 1920, height: 1277 });
  });

  it("fits a portrait original", () => {
    expect(targetSize(3000, 4000)).toEqual({ width: 1440, height: 1920 });
  });

  it("never upscales", () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("plannedSizes", () => {
  it("gives a camera original all three sizes", () => {
    expect(plannedSizes(4000, 3000)).toEqual([
      { width: 1920, height: 1440 },
      { width: 960, height: 720 },
      { width: 480, height: 360 },
    ]);
  });

  it("measures a portrait by its long edge", () => {
    expect(plannedSizes(3000, 4000).map((size) => size.height)).toEqual([1920, 960, 480]);
  });

  it("keeps a source smaller than a target at its own size, never upscaled", () => {
    expect(plannedSizes(700, 525)).toEqual([
      { width: 700, height: 525 },
      { width: 480, height: 360 },
    ]);
    expect(plannedSizes(400, 300)).toEqual([{ width: 400, height: 300 }]);
    expect(plannedSizes(1920, 1080).map((size) => size.width)).toEqual([1920, 960, 480]);
    expect(plannedSizes(960, 640).map((size) => size.width)).toEqual([960, 480]);
  });

  it("drops a size that would repeat a width or lose an edge", () => {
    // 2x1920 scales to 1x960 and 1x480 (0.5 rounds up): one width, twice.
    expect(plannedSizes(2, 1920)).toEqual([
      { width: 2, height: 1920 },
      { width: 1, height: 960 },
    ]);
  });
});

describe("encodeWithinBudget", () => {
  it("stops at the first quality when the result is small enough", async () => {
    const seen: number[] = [];
    const blob = await encodeWithinBudget(async (q) => {
      seen.push(q);
      return new Blob(["x"]);
    });
    expect(seen).toEqual([0.82]);
    expect(blob.size).toBe(1);
  });

  it("walks down to the floor, then throws too_large", async () => {
    const seen: number[] = [];
    const big = new Blob([new Uint8Array(MAX_BYTES + 1)]);
    await expect(
      encodeWithinBudget(async (q) => {
        seen.push(q);
        return big;
      }),
    ).rejects.toMatchObject({ reason: "too_large" });
    expect(seen).toEqual([0.82, 0.75, 0.68, 0.61, 0.6]);
  });
});

describe("shrink", () => {
  it("refuses an SVG without decoding it", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const svg = new File(["<svg/>"], "a.svg", { type: "image/svg+xml" });
    await expect(shrink(svg)).rejects.toMatchObject({ reason: "unsupported" });
    expect(decode).not.toHaveBeenCalled();
  });

  it("reports a file the browser cannot decode as unreadable", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("nope")));
    const file = new File(["x"], "a.heic", { type: "image/heic" });
    const error = await shrink(file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShrinkError);
    expect(error).toMatchObject({ reason: "unreadable" });
  });

  it("decodes once, draws every size from it and releases each canvas once encoded", async () => {
    const close = vi.fn();
    const bitmap = { width: 4000, height: 3000, close };
    const decode = vi.fn(async () => bitmap);
    vi.stubGlobal("createImageBitmap", decode);

    type FakeCanvas = {
      width: number;
      height: number;
      encoded: { width: number; height: number } | null;
      drawnFrom: unknown;
      getContext: (type: string, options?: unknown) => unknown;
      toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => void;
    };
    const contextOptions: unknown[] = [];
    const calls: string[] = [];
    const canvases: FakeCanvas[] = [];
    // Whether every earlier canvas had been released when a new one was made.
    const releasedBefore: boolean[] = [];
    const fakeCanvas = (): FakeCanvas => {
      releasedBefore.push(canvases.every((earlier) => earlier.width === 0 && earlier.height === 0));
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        encoded: null,
        drawnFrom: null,
        getContext: (_type, options) => {
          contextOptions.push(options);
          return {
            fillStyle: "",
            imageSmoothingQuality: "low",
            fillRect: () => calls.push("fillRect"),
            drawImage: (source: unknown) => {
              canvas.drawnFrom = source;
              calls.push("drawImage");
            },
            getImageData: (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4).fill(128),
            }),
          };
        },
        toBlob: (cb, type, q) => {
          canvas.encoded = { width: canvas.width, height: canvas.height };
          calls.push(`toBlob:${type}:${q}`);
          cb(new Blob(["x".repeat(canvas.width)]));
        },
      };
      canvases.push(canvas);
      return canvas;
    };
    // Restored by the global vi.restoreAllMocks() in setupTests.ts.
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? fakeCanvas() : original(tag)) as typeof document.createElement);

    const blobs = await shrink(new File(["x"], "a.jpg", { type: "image/jpeg" }));

    expect(decode).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(canvases.map((canvas) => canvas.encoded)).toEqual([
      { width: 1920, height: 1440 },
      { width: 960, height: 720 },
      { width: 480, height: 360 },
    ]);
    expect(canvases.map((canvas) => canvas.drawnFrom)).toEqual([bitmap, bitmap, bitmap]);
    expect(releasedBefore).toEqual([true, true, true]);
    expect(calls).toEqual(
      Array.from({ length: 3 }, () => ["fillRect", "drawImage", "toBlob:image/jpeg:0.82"]).flat(),
    );
    expect(blobs.map((blob) => blob.size)).toEqual([1920, 960, 480]);
    expect(close).toHaveBeenCalledOnce();
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    // CPU-backed canvases: Firefox's GPU canvas reads drawn images back black.
    expect(contextOptions).toEqual(Array(3).fill({ willReadFrequently: true }));
  });

  it("refuses a photo whose canvas reads back black, before anything is encoded", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
    );
    const toBlob = vi.fn();
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas"
        ? {
            width: 0,
            height: 0,
            getContext: () => ({
              fillRect: () => undefined,
              drawImage: () => undefined,
              // What Firefox's accelerated canvas hands back: every pixel zero.
              getImageData: (_x: number, _y: number, w: number, h: number) => ({
                data: new Uint8ClampedArray(w * h * 4),
              }),
            }),
            toBlob,
          }
        : original(tag)) as typeof document.createElement);

    const error = await shrink(new File(["x"], "a.jpg", { type: "image/jpeg" })).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ShrinkError);
    expect(error).toMatchObject({ reason: "blank" });
    expect(toBlob).not.toHaveBeenCalled();
  });
});

describe("stripMetadata", () => {
  const text = (value: string) => [...new TextEncoder().encode(value)];
  const segment = (marker: number, payload: number[]) => [
    0xff,
    marker,
    (payload.length + 2) >> 8,
    (payload.length + 2) & 0xff,
    ...payload,
  ];
  const SOI = [0xff, 0xd8];
  const APP0 = segment(0xe0, text("JFIF\0\x01\x01"));
  const SCAN = [0xff, 0xda, 0x00, 0x03, 0x01, 0x12, 0x34, 0xff, 0xd9];
  const exif = segment(0xe1, [...text("Exif\0\0"), 1, 2, 3, 4]);
  const xmp = segment(0xe1, [...text("http://ns.adobe.com/xap/1.0/\0"), 9, 9]);
  const other = segment(0xe1, [...text("Other\0"), 5]);
  const jpeg = (...parts: number[][]) => new Uint8Array([...SOI, ...parts.flat(), ...SCAN]);

  it("removes an Exif APP1 and leaves every other byte alone", () => {
    expect(stripMetadata(jpeg(APP0, exif))).toEqual(jpeg(APP0));
  });

  it("removes an XMP APP1", () => {
    expect(stripMetadata(jpeg(xmp, APP0))).toEqual(jpeg(APP0));
  });

  it("removes both when a file carries both", () => {
    expect(stripMetadata(jpeg(exif, APP0, xmp))).toEqual(jpeg(APP0));
  });

  it("removes an APP1 that is neither Exif nor XMP too: the server refuses every APP1", () => {
    expect(stripMetadata(jpeg(APP0, other))).toEqual(jpeg(APP0));
  });

  it("removes a comment, IPTC, extended XMP and any APPn the server does not keep", () => {
    const comment = segment(0xfe, text("<html><script>alert(1)</script></html>"));
    const iptc = segment(0xed, [...text("Photoshop 3.0\0"), ...text("8BIM")]);
    const extendedXmp = segment(0xe1, [...text("http://ns.adobe.com/xmp/extension/\0"), 7]);
    const jfxx = segment(0xe0, text("JFXX\0\x10"));
    const mpf = segment(0xe2, text("MPF\0"));
    const app15 = segment(0xef, text("anything"));

    expect(stripMetadata(jpeg(APP0, comment, iptc, extendedXmp, jfxx, mpf, app15))).toEqual(
      jpeg(APP0),
    );
  });

  it("keeps what the server keeps: JFIF, an ICC profile and Adobe's segment", () => {
    const icc = segment(0xe2, [...text("ICC_PROFILE\0"), 1, 1, 9, 9]);
    const adobe = segment(0xee, [...text("Adobe"), 0, 100, 0, 0, 0, 0, 1]);
    const input = jpeg(APP0, icc, adobe);
    expect(stripMetadata(input)).toBe(input);
  });

  it("returns the input untouched when there is nothing to remove", () => {
    const input = jpeg(APP0);
    expect(stripMetadata(input)).toBe(input);
  });

  it("does not look into the scan for something that resembles a marker", () => {
    const input = new Uint8Array([...SOI, ...APP0, 0xff, 0xda, 0x00, 0x02, ...exif]);
    expect(stripMetadata(input)).toBe(input);
  });

  it("returns a truncated file unchanged and does not throw", () => {
    for (const cut of [1, 3, 6, 9]) {
      const input = jpeg(APP0, exif).slice(0, cut + APP0.length);
      expect(() => stripMetadata(input)).not.toThrow();
      expect(stripMetadata(input)).toBe(input);
    }
    const lying = new Uint8Array([...SOI, 0xff, 0xe1, 0xff, 0xff, 1, 2]);
    expect(stripMetadata(lying)).toBe(lying);
  });

  it("returns something that is not a JPEG unchanged", () => {
    const input = new Uint8Array([1, 2, 3, 4, 5]);
    expect(stripMetadata(input)).toBe(input);
  });

  it("strips each candidate before the size check", async () => {
    const padded = new Blob([jpeg(exif, APP0)]);
    const blob = await encodeWithinBudget(async () => padded, jpeg(APP0).length);
    expect(blob.size).toBe(jpeg(APP0).length);
  });
});
