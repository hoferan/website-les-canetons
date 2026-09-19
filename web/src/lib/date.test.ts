import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import {
  formatEventDate,
  formatEventDateRange,
  formatInstant,
  formatLastLogin,
  formatTime,
} from "./date";

afterEach(async () => {
  await setLocale("fr");
});

// THE REGRESSION GUARD FOR THE WHOLE PR. Every one of these is what the app
// renders today; if any changes, French output has moved and something is
// wrong.
test("French output is exactly what it was before the locale existed", () => {
  expect(formatEventDate("2026-12-05")).toBe("samedi 5 décembre 2026");
  expect(formatEventDateRange("2026-12-05")).toBe(
    "samedi 5 décembre 2026 au dimanche 6 décembre 2026",
  );
  expect(formatTime("19:00:00")).toBe("19:00");
  expect(formatInstant("2026-09-15T10:05:00Z")).toBe("15 septembre 2026 à 12:05");
  expect(formatLastLogin("2026-09-15T10:05:00Z")).toBe("15 septembre 2026");
});

test("German renders in de-CH", async () => {
  await setLocale("de-CH");

  expect(formatEventDate("2026-12-05")).toBe("Samstag, 5. Dezember 2026");
  expect(formatEventDateRange("2026-12-05")).toBe(
    "Samstag, 5. Dezember 2026 bis Sonntag, 6. Dezember 2026",
  );
  expect(formatInstant("2026-09-15T10:05:00Z")).toBe("15. September 2026 um 12:05");
  expect(formatLastLogin("2026-09-15T10:05:00Z")).toBe("15. September 2026");
});

// PINS THE TIMEZONE. The API sends UTC and an evening login in Fribourg is the
// previous day in UTC; formatted in the viewer's zone this would also differ
// between two committee members reading the same roster.
test("instants are pinned to Europe/Zurich, not the viewer's zone", () => {
  expect(formatInstant("2026-01-15T23:30:00Z")).toBe("16 janvier 2026 à 00:30");
});

// ---------------------------------------------------------------------------
// The cases this file carried before the locale work. Each covers something
// the three tests above do not: a month rollover, the local-date parsing
// regression, a leading-zero time, a non-UTC offset on the way in, and a year
// rollover across the Zurich pin.
// ---------------------------------------------------------------------------

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

test("a login instant renders as a French date without a time", () => {
  expect(formatLastLogin("2026-09-01T19:30:00+02:00")).toBe("1 septembre 2026");
});

// The reason the formatter pins a timeZone rather than using the viewer's.
// This instant is 31 December in UTC and 1 January in Fribourg; a committee
// member reading the roster is in Fribourg, and the API sends UTC.
test("a login instant is rendered in Zurich time, not UTC", () => {
  expect(formatLastLogin("2026-12-31T23:30:00Z")).toBe("1 janvier 2027");
});
