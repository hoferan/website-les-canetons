import { expect, test } from "vitest";

// The suite runs in America/New_York on purpose, so a formatter that lost its
// pinned zone renders the wrong day (vitest.config.ts, #177). That only works
// if the zone actually took. `process.env.TZ` is no evidence: in a worker
// thread it can name New York while the runtime still formats in the
// machine's own zone, and every date test then passes over the bug it exists
// to catch. So ask the runtime itself.
test("the suite really runs in the deliberately wrong time zone", () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/New_York");
  // Mid-January, so standard time: five hours behind UTC.
  expect(new Date("2026-01-15T12:00:00Z").getTimezoneOffset()).toBe(300);
});
