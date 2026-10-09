import { expect, test } from "vitest";

import { generator, KINDS, randomPiece } from "./piece";

test("rolls every shape, and colours only from the palette it is given", () => {
  const random = generator(1);
  const pieces = Array.from({ length: 500 }, () => randomPiece(random, 3));

  expect(new Set(pieces.map((piece) => piece.kind))).toEqual(new Set(KINDS));
  expect(new Set(pieces.map((piece) => piece.colour))).toEqual(new Set([0, 1, 2]));
  for (const piece of pieces) {
    expect(piece.rotate).toBeGreaterThanOrEqual(0);
    expect(piece.rotate).toBeLessThan(360);
    expect(piece.scale).toBeGreaterThanOrEqual(1);
    expect(piece.scale).toBeLessThan(2.1);
  }
});

/**
 * The page decoration depends on this: a hero scatters the same confetti on
 * every visit, so a screenshot taken today matches one taken next week.
 */
test("the same seed rolls the same pieces", () => {
  const first = generator(42);
  const second = generator(42);
  const roll = (random: () => number) => Array.from({ length: 20 }, () => randomPiece(random, 4));

  expect(roll(first)).toEqual(roll(second));
});
