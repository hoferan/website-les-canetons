import { describe, expect, it, vi } from "vitest";

import { drawTurned, rotatePhoto, type Turn } from "./rotate";
import { ShrinkError, type PhotoSource } from "./shrink";

type Call = [string, ...number[]];

/** A canvas whose 2D context records every transform and draw. */
function recordingCanvas() {
  const calls: Call[] = [];
  const drawn: unknown[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      translate: (x: number, y: number) => calls.push(["translate", x, y]),
      rotate: (angle: number) => calls.push(["rotate", angle]),
      drawImage: (source: unknown, x: number, y: number) => {
        drawn.push(source);
        calls.push(["drawImage", x, y]);
      },
    }),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, calls, drawn };
}

/** Where the transform the canvas recorded sends a point of the source. */
function mapPoint(calls: Call[], x: number, y: number): [number, number] {
  let px = x;
  let py = y;
  // Canvas transforms compose: the last one set applies to the point first.
  for (const [name, a = 0, b = 0] of [...calls].reverse()) {
    if (name === "rotate") {
      const [cos, sin] = [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
      [px, py] = [px * cos - py * sin, px * sin + py * cos];
    } else if (name === "translate") {
      [px, py] = [px + a, py + b];
    }
  }
  return [px, py];
}

describe("drawTurned", () => {
  const source = { width: 1920, height: 1280 } as PhotoSource;

  it.each<[Turn, [number, number], [number, number]]>([
    // A quarter clockwise: the top left corner goes to the top right.
    ["right", [1280, 0], [0, 1920]],
    // A quarter anticlockwise: the top left corner goes to the bottom left.
    ["left", [0, 1920], [1280, 0]],
  ])("turns a photo %s onto a canvas of swapped size", (turn, topLeft, bottomRight) => {
    const { canvas, calls, drawn } = recordingCanvas();

    const turned = drawTurned(source, turn, canvas);

    expect(turned).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual([1280, 1920]);
    expect(drawn).toEqual([source]);
    const transforms = calls.filter(([name]) => name !== "drawImage");
    expect(mapPoint(transforms, 0, 0)).toEqual(topLeft);
    expect(mapPoint(transforms, 1920, 1280)).toEqual(bottomRight);
  });
});

describe("rotatePhoto", () => {
  function steps() {
    const order: string[] = [];
    const decoded = { width: 1920, height: 1280, close: vi.fn(() => order.push("close")) };
    const turned = { width: 1280, height: 1920 };
    const sizes = [new Blob(["1920"]), new Blob(["960"]), new Blob(["480"])];
    return {
      order,
      decoded,
      turned,
      sizes,
      load: vi.fn(async (url: string) => {
        order.push(`load ${url}`);
        return new Blob(["jpeg"]);
      }),
      decode: vi.fn(async () => {
        order.push("decode");
        return decoded as unknown as ImageBitmap;
      }),
      turn: vi.fn((_source: PhotoSource, turn: Turn) => {
        order.push(`turn ${turn}`);
        return turned as unknown as HTMLCanvasElement;
      }),
      encode: vi.fn(async (source: PhotoSource) => {
        order.push(`encode ${source.width}x${source.height}`);
        return sizes;
      }),
    };
  }

  it("loads the largest size, turns it, and encodes it through the upload's pipeline", async () => {
    const s = steps();

    const sizes = await rotatePhoto(
      "/api/v1/images/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.jpg",
      "left",
      s,
    );

    expect(sizes).toBe(s.sizes);
    expect(s.order).toEqual([
      "load /api/v1/images/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.jpg",
      "decode",
      "turn left",
      // The decoded photo is released before the slow part starts.
      "close",
      "encode 1280x1920",
    ]);
    expect(s.encode).toHaveBeenCalledWith(s.turned);
    // The turned canvas is released once its sizes exist.
    expect([s.turned.width, s.turned.height]).toEqual([0, 0]);
  });

  it("releases the decoded photo and the canvas when encoding fails", async () => {
    const s = steps();
    s.encode.mockRejectedValueOnce(new ShrinkError("too_large"));

    await expect(rotatePhoto("/x.jpg", "right", s)).rejects.toMatchObject({ reason: "too_large" });

    expect(s.decoded.close).toHaveBeenCalledOnce();
    expect([s.turned.width, s.turned.height]).toEqual([0, 0]);
  });

  it("reports a size it could not load as unreadable", async () => {
    const s = steps();
    s.load.mockRejectedValueOnce(new ShrinkError("unreadable"));

    await expect(rotatePhoto("/x.jpg", "right", s)).rejects.toBeInstanceOf(ShrinkError);
    expect(s.decode).not.toHaveBeenCalled();
  });
});
