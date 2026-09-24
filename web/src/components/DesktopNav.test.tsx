import { expect, test } from "vitest";

import { fitting } from "./DesktopNav";

// Widths of 100 with 20px gaps: n entries take 100n + 20(n - 1).
const five = [100, 100, 100, 100, 100];

test("everything fits: no Plus", () => {
  expect(fitting(five, 50, 580)).toBe(5);
});

test("one pixel short: the rightmost folds, and Plus takes its room", () => {
  // Three entries and Plus: 50 + 3 * (20 + 100) = 410.
  // Plus and four entries: 50 + 4 * (20 + 100) = 530.
  expect(fitting(five, 50, 579)).toBe(4);
  expect(fitting(five, 50, 530)).toBe(4);
  expect(fitting(five, 50, 529)).toBe(3);
  expect(fitting(five, 50, 410)).toBe(3);
  expect(fitting(five, 50, 409)).toBe(2);
});

test("folds from the right, keeping the order of importance", () => {
  // A wide first entry is kept even when two narrow ones after it would fit
  // in the same room: importance, not packing.
  expect(fitting([300, 60, 60], 50, 400)).toBe(1);
});

test("no room at all: everything is under Plus", () => {
  expect(fitting(five, 50, 60)).toBe(0);
});
