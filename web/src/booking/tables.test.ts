import { expect, test } from "vitest";

import { tablesOf } from "./tables";

const booking = (tableName: string | null, guestCount: number) => ({ tableName, guestCount });

test("one table per trimmed name, with its people summed", () => {
  expect(tablesOf([booking("Müller", 2), booking(" Müller ", 3), booking("Clerc", 1)])).toEqual([
    { name: "Clerc", guests: 1 },
    { name: "Müller", guests: 5 },
  ]);
});

test("names that differ in case stay two tables", () => {
  expect(tablesOf([booking("Müller", 2), booking("müller", 1)])).toHaveLength(2);
});

test("a booking without a table is no table", () => {
  expect(tablesOf([booking(null, 4), booking("  ", 2)])).toEqual([]);
});

test("sorts the way a French reader looks names up", () => {
  expect(
    tablesOf([booking("Zbinden", 1), booking("Égger", 1), booking("de Weck", 1)]).map(
      (t) => t.name,
    ),
  ).toEqual(["de Weck", "Égger", "Zbinden"]);
});
