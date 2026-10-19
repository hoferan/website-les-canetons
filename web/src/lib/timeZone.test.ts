import { expect, test } from "vitest";

// The suite runs in America/New_York on purpose (vitest.config.ts), so a
// formatter that lost its pinned zone renders the wrong day. `process.env.TZ`
// is no evidence that the zone took: in a worker thread it can name New York
// while the runtime formats in the machine's zone. So ask the runtime.
test("the suite really runs in the deliberately wrong time zone", () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/New_York");
  // Mid-January, so standard time: five hours behind UTC.
  expect(new Date("2026-01-15T12:00:00Z").getTimezoneOffset()).toBe(300);
});
