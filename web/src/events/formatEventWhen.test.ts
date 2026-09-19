import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { formatEventWhen } from "./formatEventWhen";

// THIN SPACE, EN DASH, THIN SPACE -- what Intl's formatRange actually emits,
// and therefore what the hand-composed one-day form matches. Spelled out here
// because an ordinary space looks identical in source and in a failure
// message: asserting " - " against this fails with "expected X to be X".
const SEP = "\u2009\u2013\u2009";

afterEach(async () => {
  await setLocale("fr");
});

test("a single-day event renders one short date and a time range", () => {
  const when = formatEventWhen("2026-09-05T10:00:00+02:00", "2026-09-05T12:00:00+02:00");
  expect(when).toBe(`sam., 05.09.2026, 10:00${SEP}12:00`);
});

test("an event crossing days renders a date RANGE", () => {
  // "Weekend musical, 3-4 October" from the live planning. This is what the
  // old `weekend` boolean existed to fake, and it now falls out of the dates.
  //
  // Intl's own formatRange composes this, which is the point of the short
  // form: the hand-built "du … à … au … à …" is gone, and with it the `à`
  // that only existed because the comma had been removed (#162).
  const when = formatEventWhen("2026-10-03T09:00:00+02:00", "2026-10-04T16:00:00+02:00");
  expect(when).toBe(`sam., 03.10.2026 09:00${SEP}dim., 04.10.2026 16:00`);
});

test("the same events in German, composed by Intl rather than by hand", async () => {
  // THE WHOLE ARGUMENT FOR THE SHORT FORM, in two assertions. German wants a
  // comma after the weekday that long-form French rejects, so one
  // hand-composed sentence could never serve both languages — which is what
  // made #154 look expensive. In the short form each locale gets its own
  // correct punctuation for free: note German's extra comma before the time,
  // which French does not take.
  await setLocale("de-CH");

  expect(formatEventWhen("2026-09-05T10:00:00+02:00", "2026-09-05T12:00:00+02:00")).toBe(
    `Sa., 05.09.2026, 10:00${SEP}12:00`,
  );
  expect(formatEventWhen("2026-10-03T09:00:00+02:00", "2026-10-04T16:00:00+02:00")).toBe(
    `Sa., 03.10.2026, 09:00${SEP}So., 04.10.2026, 16:00`,
  );
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
  expect(when).toBe(`sam., 05.09.2026 23:00${SEP}dim., 06.09.2026 01:00`);
});
