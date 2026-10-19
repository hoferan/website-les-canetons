import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { setLocale } from "../i18n";
import { formatDay, formatInstant, formatLastLogin } from "./date";

afterEach(async () => {
  await setLocale("fr");
});

// The French output the screens' own tests assert; if any changes, something
// is wrong.
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

// The API sends UTC, and this instant is the next day in Fribourg.
test("instants are pinned to Europe/Zurich, not the viewer's zone", () => {
  expect(formatInstant("2026-01-15T23:30:00Z")).toBe("16 janvier 2026 à 00:30");
});

// 31 December in UTC, 1 January in Fribourg.
test("a login instant is rendered in Zurich time, not UTC", () => {
  expect(formatLastLogin("2026-12-31T23:30:00Z")).toBe("1 janvier 2027");
});

/**
 * No formatter in date.ts may read the ambient zone: under a hostile TZ,
 * every function must render exactly what it renders in Fribourg.
 *
 * Asia/Kolkata because vitest.config.ts already pins America/New_York for the
 * whole run, so the tests above run west of Fribourg. Kolkata is +5:30 with no
 * DST: east, and not a whole number of hours off, so offset arithmetic by the
 * hour lands on :35 instead of :05 here and nowhere else in this file.
 *
 * The module is re-imported. date.ts caches its formatters, and a formatter
 * keeps the zone current when it was constructed, so the warm cache from the
 * tests above would ignore this block's TZ. vi.resetModules() plus a dynamic
 * import gives a cold cache; a static import is hoisted past beforeAll.
 *
 * The instants straddle midnight eastward: a 19:00 UTC instant is one evening
 * in Zurich and past midnight in Kolkata, so every assertion fails if a pin
 * goes.
 *
 * Scoped to this block, so the tests above stay the contrast. TZ is restored
 * afterwards because Vitest reuses a worker across files, and the modules are
 * reset again so nothing later inherits formatters built in Kolkata.
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
    // Not the formatters imported at the top: those are warm, built in New
    // York.
    const date = await import("./date");

    // What Fribourg renders. Without `timeZone: "Europe/Zurich"` in date.ts
    // these become 15:35, 1 janvier 2027 and 1 janvier 2026.
    expect(date.formatInstant("2026-09-15T10:05:00Z")).toBe("15 septembre 2026 à 12:05");
    expect(date.formatLastLogin("2026-12-31T19:00:00Z")).toBe("31 décembre 2026");
    expect(date.formatDay("2025-12-31T19:00:00Z")).toBe("31 décembre 2025");
  });
});
