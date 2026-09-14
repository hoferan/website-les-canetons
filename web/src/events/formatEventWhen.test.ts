import { expect, test } from "vitest";

import { formatEventWhen } from "./formatEventWhen";

test("a single-day event renders one date and a time range", () => {
  const when = formatEventWhen("2026-09-05T10:00:00+02:00", "2026-09-05T12:00:00+02:00");
  expect(when).toBe("samedi 5 septembre 2026, 10:00 – 12:00");
});

test("an event crossing days renders a date RANGE", () => {
  // "Weekend musical, 3-4 October" from the live planning. This is what the
  // old `weekend` boolean existed to fake, and it now falls out of the dates.
  const when = formatEventWhen("2026-10-03T09:00:00+02:00", "2026-10-04T16:00:00+02:00");
  expect(when).toBe("du samedi 3 octobre 2026 à 09:00 au dimanche 4 octobre 2026 à 16:00");
});

test("it renders Fribourg time regardless of where the browser is", () => {
  // A member reading the planning from Sydney must still see 10:00, because
  // the rehearsal is at 10:00 in Fribourg. The offset in the input is what
  // makes this checkable without changing the test runner's timezone.
  const when = formatEventWhen("2026-12-05T09:00:00Z", "2026-12-05T11:00:00Z");
  expect(when).toContain("10:00");
});

test("it summers and winters correctly, which a fixed offset would not", () => {
  // The same UTC wall-clock hour is 10:00 in Fribourg in December and 11:00 in
  // September, because CET is +01:00 and CEST is +02:00. A formatter pinned to
  // one offset gets half the season right, which is the failure that looks
  // like nothing until somebody misses a rehearsal.
  expect(formatEventWhen("2026-12-05T09:00:00Z", "2026-12-05T11:00:00Z")).toContain("10:00");
  expect(formatEventWhen("2026-09-05T09:00:00Z", "2026-09-05T11:00:00Z")).toContain("11:00");
});

test("a night event ending after midnight is a date RANGE, judged in Fribourg", () => {
  // 23:00–01:00 Fribourg time. Judged on the raw ISO strings this is one UTC
  // day and would render as a single date with a time range reading
  // "23:00 – 01:00", which describes an event that ran backwards.
  const when = formatEventWhen("2026-09-05T23:00:00+02:00", "2026-09-06T01:00:00+02:00");
  expect(when).toContain("du samedi 5 septembre 2026");
  expect(when).toContain("au dimanche 6 septembre 2026");
});
