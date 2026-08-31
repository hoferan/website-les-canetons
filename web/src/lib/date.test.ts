import { expect, test } from "vitest";

import { formatEventDate, formatEventDateRange, formatTime } from "./date";

test("a date renders as a long French date", () => {
  expect(formatEventDate("2026-12-05")).toBe("samedi 5 décembre 2026");
});

test("a weekend renders as a range across two days", () => {
  expect(formatEventDateRange("2026-11-14")).toBe(
    "samedi 14 novembre 2026 au dimanche 15 novembre 2026",
  );
});

test("a range crossing a month boundary still reads correctly", () => {
  expect(formatEventDateRange("2026-10-31")).toBe(
    "samedi 31 octobre 2026 au dimanche 1 novembre 2026",
  );
});

// The regression this file exists for: "2026-01-01" parsed as UTC midnight
// renders as 31 December 2025 in any negative offset. Right in Fribourg, wrong
// for a visitor in the Americas — the hardest kind of bug to notice from here.
test("a date string is parsed as a plain local date, not shifted by the timezone", () => {
  expect(formatEventDate("2026-01-01")).toContain("1 janvier 2026");
});

test("a time is trimmed to hours and minutes", () => {
  expect(formatTime("19:00:00")).toBe("19:00");
  expect(formatTime("09:05:00")).toBe("09:05");
});
