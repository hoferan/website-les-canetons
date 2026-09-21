import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { formatDay, formatInstant, formatLastLogin } from "./date";

afterEach(async () => {
  await setLocale("fr");
});

// THE REGRESSION GUARD FOR THE LOCALE WORK. Every one of these is what the app
// renders today; if any changes, French output has moved and something is
// wrong.
test("French output is exactly what it was before the locale existed", () => {
  expect(formatInstant("2026-09-15T10:05:00Z")).toBe("15 septembre 2026 à 12:05");
  expect(formatLastLogin("2026-09-15T10:05:00Z")).toBe("15 septembre 2026");
  expect(formatDay("2026-09-15T10:05:00Z")).toBe("15 septembre 2026");
});

test("German renders in de-CH", async () => {
  await setLocale("de-CH");

  expect(formatInstant("2026-09-15T10:05:00Z")).toBe("15. September 2026 um 12:05");
  expect(formatLastLogin("2026-09-15T10:05:00Z")).toBe("15. September 2026");
});

// PINS THE TIMEZONE. The API sends UTC and an evening login in Fribourg is the
// previous day in UTC; formatted in the viewer's zone this would also differ
// between two committee members reading the same roster.
test("instants are pinned to Europe/Zurich, not the viewer's zone", () => {
  expect(formatInstant("2026-01-15T23:30:00Z")).toBe("16 janvier 2026 à 00:30");
});

// The reason the formatter pins a timeZone rather than using the viewer's.
// This instant is 31 December in UTC and 1 January in Fribourg; a committee
// member reading the roster is in Fribourg, and the API sends UTC.
test("a login instant is rendered in Zurich time, not UTC", () => {
  expect(formatLastLogin("2026-12-31T23:30:00Z")).toBe("1 janvier 2027");
});

/**
 * THE GUARD THIS FILE USED TO HAVE, MADE ABLE TO FAIL (#161).
 *
 * It used to assert that `formatEventDate("2026-01-01")` contained
 * "1 janvier 2026" — the regression being that a date-only string parsed as
 * UTC midnight renders as 31 December 2025 anywhere west of Greenwich. Right
 * in Fribourg, wrong in the Americas, which is the hardest kind of bug to see
 * from here.
 *
 * IT COULD NOT FAIL WHERE IT RAN. Nothing pins a timezone for the test run,
 * and both CI and a Fribourg laptop sit at or east of UTC — so the assertion
 * held whether or not the parsing was right. It guarded nothing for its whole
 * life, which is worth knowing before trusting the next one.
 *
 * The function it guarded is gone, and so is the local-date parsing it
 * protected: everything that renders a bare date now parses
 * "YYYY-MM-DDT00:00:00Z" and formats with `timeZone: "UTC"`, and everything
 * here pins Europe/Zurich. So the invariant worth guarding is no longer how
 * one helper parses — it is that NO formatter in this module reads the ambient
 * zone. Under a deliberately hostile TZ, every surviving function must render
 * exactly what it renders in Fribourg.
 *
 * SCOPED TO THIS BLOCK, not the file. A file-level beforeAll would shift the
 * tests above too, and they are the control: they have to run in whatever zone
 * the suite normally uses or this one proves nothing by comparison.
 *
 * Restored afterwards because Vitest reuses a worker across files, and a
 * leaked TZ is the kind of failure that passes in isolation and fails in a
 * full run.
 */
describe("under a viewer's timezone five hours west of Fribourg", () => {
  const realZone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });

  afterAll(() => {
    process.env.TZ = realZone;
  });

  test("the viewer's timezone cannot move a rendered date", () => {
    // The same inputs and the same expectations as the tests above. Drop
    // `timeZone: "Europe/Zurich"` from either shape in date.ts and all three
    // of these move by a day or five hours.
    expect(formatInstant("2026-09-15T10:05:00Z")).toBe("15 septembre 2026 à 12:05");
    expect(formatLastLogin("2026-12-31T23:30:00Z")).toBe("1 janvier 2027");
    expect(formatDay("2026-01-01T00:30:00Z")).toBe("1 janvier 2026");
  });
});
