import { expect, test } from "vitest";

import { REACH } from "./piece";
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

/**
 * The centre is not enough: a squiggle is 28 units long and drawn at up to
 * 2.1 times that, so one placed just outside a centre-only margin still lay
 * across the first letters of a heading. Every piece's whole reach has to stay
 * clear, over enough seeds to draw each kind at a large scale.
 */
test("keeps the whole of every shape out of the boxes it avoids", () => {
  const headline = { left: 80, top: 120, right: 640, bottom: 360 };

  for (let seed = 1; seed <= 40; seed++) {
    for (const piece of scatter({ ...BOX, seed, avoid: [headline] })) {
      const dx = Math.max(headline.left - piece.x, 0, piece.x - headline.right);
      const dy = Math.max(headline.top - piece.y, 0, piece.y - headline.bottom);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(REACH[piece.kind] * piece.scale);
    }
  }
});

/** A phone's hero is a fraction of a desktop's, and should not be as dense. */
test("scales the number of pieces with the area", () => {
  const desktop = scatter({ width: 1280, height: 600, seed: 1, avoid: [] });
  const phone = scatter({ width: 390, height: 600, seed: 1, avoid: [] });

  expect(desktop.length).toBeGreaterThan(phone.length * 2);
});

/** The phone menu asks for more, because its list leaves little free space. */
test("multiplies the number of pieces by the density", () => {
  const usual = scatter({ width: 390, height: 600, seed: 1, avoid: [] });
  const dense = scatter({ width: 390, height: 600, seed: 1, avoid: [], density: 2.5 });

  expect(dense.length).toBe(Math.round(usual.length * 2.5));
});

test("scatters nothing into a box with no size", () => {
  expect(scatter({ width: 0, height: 0, seed: 1, avoid: [] })).toEqual([]);
});
