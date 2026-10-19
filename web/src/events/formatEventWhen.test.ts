import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { formatEventDay, formatEventWhen } from "./formatEventWhen";

// Thin space, en dash, thin space: what Intl's formatRange emits, and so what
// the hand-composed one-day form matches. Spelled out because an ordinary
// space looks identical in source and in a failure message.
const SEP = "\u2009\u2013\u2009";

afterEach(async () => {
  await setLocale("fr");
});

test("a single-day event renders one short date and a time range", () => {
  const when = formatEventWhen("2026-09-05T10:00:00+02:00", "2026-09-05T12:00:00+02:00");
  expect(when).toBe(`sam., 05.09.2026, 10:00${SEP}12:00`);
});

test("an event crossing days renders a date RANGE", () => {
  // The musical weekend, 3 and 4 October. Intl's formatRange composes it.
  const when = formatEventWhen("2026-10-03T09:00:00+02:00", "2026-10-04T16:00:00+02:00");
  expect(when).toBe(`sam., 03.10.2026 09:00${SEP}dim., 04.10.2026 16:00`);
});

test("the same events in German, composed by Intl rather than by hand", async () => {
  // In the short form each locale gets its own punctuation from Intl: note
  // German's extra comma before the time, which French does not take.
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
  // The same UTC hour is 10:00 in Fribourg in December and 11:00 in
  // September (CET is +01:00, CEST +02:00). A formatter pinned to one offset
  // gets half the season wrong.
  expect(formatEventWhen("2026-12-05T09:00:00Z", "2026-12-05T11:00:00Z")).toContain("10:00");
  expect(formatEventWhen("2026-09-05T09:00:00Z", "2026-09-05T11:00:00Z")).toContain("11:00");
});

test("a night event ending after midnight is a date RANGE, judged in Fribourg", () => {
  // 23:00 to 01:00 Fribourg time. Judged in UTC this is one day, and would
  // render as one date with a time range that runs backwards.
  const when = formatEventWhen("2026-09-05T23:00:00+02:00", "2026-09-06T01:00:00+02:00");
  expect(when).toBe(`sam., 05.09.2026 23:00${SEP}dim., 06.09.2026 01:00`);
});

test("the date badge reads the day and the short month in Fribourg", async () => {
  // 23:30 UTC on 30 November is already 1 December in Fribourg, so a badge
  // built from the browser's zone on a UTC runner would show the wrong day.
  expect(formatEventDay("2026-11-30T23:30:00Z")).toEqual({ day: "1", month: "déc." });

  await setLocale("de-CH");
  expect(formatEventDay("2026-11-30T23:30:00Z")).toEqual({ day: "1", month: "Dez." });
});
