import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

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
 * THE GUARD THIS FILE USED TO HAVE, MADE ABLE TO FAIL (#161), AND MADE ABLE TO
 * FAIL AGAIN NOW THAT THE WHOLE RUN MOVED (#177).
 *
 * It used to assert that `formatEventDate("2026-01-01")` contained
 * "1 janvier 2026" — the regression being that a date-only string parsed as
 * UTC midnight renders as 31 December 2025 anywhere west of Greenwich. Right
 * in Fribourg, wrong in the Americas, which is the hardest kind of bug to see
 * from here.
 *
 * IT COULD NOT FAIL WHERE IT RAN. Nothing pinned a timezone for the test run,
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
 * ASIA/KOLKATA, AND NOT AMERICA/NEW_YORK ANY MORE. This block used to pin the
 * latter, back when the run itself had no zone. vitest.config.ts now pins
 * America/New_York for the whole run (#177), so the tests above are already
 * five hours west of Fribourg; re-pinning it here would assert the same thing
 * twice under a name that claims otherwise — the way the guard it replaced
 * became a no-op.
 *
 * What the run's own zone does NOT cover is a half-hour offset. Kolkata is
 * +5:30 with no DST: east of Fribourg where the run is west, and not a whole
 * number of hours off, so anything doing offset arithmetic by the hour lands
 * on :35 instead of :05 here and nowhere else in this file.
 *
 * TWO THINGS HAD TO CHANGE FOR THE BLOCK TO MEAN ANYTHING, and both were
 * pre-existing defects found by deleting the `timeZone` pins from date.ts and
 * reading what came back, not by reading the test.
 *
 * 1. THE MODULE IS RE-IMPORTED. date.ts caches its Intl.DateTimeFormat
 *    instances at module scope, and a formatter is bound to the zone current
 *    when it was CONSTRUCTED — assigning process.env.TZ afterwards does not
 *    move one that already exists. The tests above build both shapes, so the
 *    cache was warm by the time this block ran and the zone it set reached
 *    nothing: with the pins deleted, the first assertion rendered 15:35 when
 *    this block ran alone and 06:05 — New York, the run's zone, not Kolkata
 *    — when the file ran whole. It has never once discriminated on the zone
 *    it names. vi.resetModules() plus a dynamic import inside the test gives
 *    it a cold cache; the import cannot be static, because a static one is
 *    hoisted past beforeAll and would be built under the run's zone like
 *    everything else.
 *
 * 2. THE INSTANTS STRADDLE MIDNIGHT EASTWARD. This block used to reuse the
 *    inputs from the tests above, which are chosen to move WEST of Fribourg.
 *    Two of the three do not move east at all: 2026-01-01T00:30:00Z is 1
 *    January in Zurich and in Kolkata alike, so that assertion passed with or
 *    without the pin. A 19:00 UTC instant is the evening of one day in Zurich
 *    and past midnight in Kolkata, so all three now fail if a pin goes.
 *
 * SCOPED TO THIS BLOCK, not the file, so the tests above stay the contrast —
 * they run in the suite's own zone and this one runs somewhere else, and the
 * pair only means anything while those two differ.
 *
 * Restored afterwards because Vitest reuses a worker across files, and a
 * leaked TZ is the kind of failure that passes in isolation and fails in a
 * full run. That restore is only honest now that the run pins a zone: before
 * #177 `realZone` was `undefined` on CI and the restore wrote back the literal
 * string "undefined". The modules are reset on the way out too, so nothing
 * later inherits formatters built in Kolkata.
 */
describe("under a viewer's timezone on a half-hour offset, east of Fribourg", () => {
  const realZone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Asia/Kolkata";
    vi.resetModules();
  });

  afterAll(() => {
    process.env.TZ = realZone;
    vi.resetModules();
  });

  test("the viewer's timezone cannot move a rendered date", async () => {
    // Deliberately NOT the formatters imported at the top of this file: those
    // are the warm ones, built in New York. See the docblock.
    const date = await import("./date");

    // Every expectation is what Fribourg renders. Drop `timeZone:
    // "Europe/Zurich"` from either shape in date.ts and each moves, measured:
    // 15:35 (the half-hour offset showing through, which no other test in this
    // file can see), 1 janvier 2027, and 1 janvier 2026.
    expect(date.formatInstant("2026-09-15T10:05:00Z")).toBe("15 septembre 2026 à 12:05");
    expect(date.formatLastLogin("2026-12-31T19:00:00Z")).toBe("31 décembre 2026");
    expect(date.formatDay("2025-12-31T19:00:00Z")).toBe("31 décembre 2025");
  });
});
