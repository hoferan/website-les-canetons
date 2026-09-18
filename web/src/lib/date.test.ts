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
