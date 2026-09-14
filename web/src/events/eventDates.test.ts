import { expect, test } from "vitest";

import { weekdayDatesBetween } from "./eventDates";

test("it lists every Saturday in a range, inclusive of both ends", () => {
  // 5 September 2026 is a Saturday.
  const dates = weekdayDatesBetween("2026-09-05", "2026-09-26", 6);
  expect(dates).toEqual(["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"]);
});

test("it starts at the first matching weekday on or after the from-date", () => {
  const dates = weekdayDatesBetween("2026-09-01", "2026-09-13", 6);
  expect(dates).toEqual(["2026-09-05", "2026-09-12"]);
});

test("it crosses the turn of the year and the end of summer time", () => {
  // The real season runs September to January and the clocks change in
  // October. A naive "add 7 * 24 hours" drifts by an hour and eventually
  // lands on a Friday.
  const dates = weekdayDatesBetween("2026-10-24", "2026-11-07", 6);
  expect(dates).toEqual(["2026-10-24", "2026-10-31", "2026-11-07"]);
});

test("a range containing no matching weekday is empty, not an error", () => {
  expect(weekdayDatesBetween("2026-09-07", "2026-09-11", 6)).toEqual([]);
});

test("a backwards range is empty rather than infinite", () => {
  // The loop guard. Without it a from-date after the to-date spins forever and
  // the tab locks up, which is a far worse failure than an empty list.
  expect(weekdayDatesBetween("2026-09-26", "2026-09-05", 6)).toEqual([]);
});

test("an incomplete range is empty, because a half-typed date is not a range", () => {
  // The generator recomputes on every keystroke, so it asks this question
  // before either box holds a date. Date.parse says NaN and every comparison
  // against NaN is false, which without a guard is the infinite loop again.
  expect(weekdayDatesBetween("", "2026-09-26", 6)).toEqual([]);
  expect(weekdayDatesBetween("2026-09-05", "", 6)).toEqual([]);
});
