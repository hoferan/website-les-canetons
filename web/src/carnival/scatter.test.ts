import { expect, test } from "vitest";

import { scatter } from "./scatter";

const BOX = { width: 1280, height: 600 };

test("puts the same pieces in the same places for the same seed", () => {
  expect(scatter({ ...BOX, seed: 7, avoid: [] })).toEqual(scatter({ ...BOX, seed: 7, avoid: [] }));
  expect(scatter({ ...BOX, seed: 7, avoid: [] })).not.toEqual(
    scatter({ ...BOX, seed: 8, avoid: [] }),
  );
});

/**
 * Confetti is decoration, so it must never sit behind text. A piece whose
 * centre lands inside an avoided box (plus the margin) is dropped, not moved.
 */
test("keeps every piece out of the boxes it is told to avoid", () => {
  const headline = { left: 80, top: 120, right: 640, bottom: 360 };
  const pieces = scatter({ ...BOX, seed: 3, avoid: [headline] });

  expect(pieces.length).toBeGreaterThan(0);
  for (const piece of pieces) {
    const inside =
      piece.x > headline.left - 14 &&
      piece.x < headline.right + 14 &&
      piece.y > headline.top - 14 &&
      piece.y < headline.bottom + 14;
    expect(inside).toBe(false);
  }
});

/** A phone's hero is a fraction of a desktop's, and should not be as dense. */
test("scales the number of pieces with the area", () => {
  const desktop = scatter({ width: 1280, height: 600, seed: 1, avoid: [] });
  const phone = scatter({ width: 390, height: 600, seed: 1, avoid: [] });

  expect(desktop.length).toBeGreaterThan(phone.length * 2);
});

test("scatters nothing into a box with no size", () => {
  expect(scatter({ width: 0, height: 0, seed: 1, avoid: [] })).toEqual([]);
});
