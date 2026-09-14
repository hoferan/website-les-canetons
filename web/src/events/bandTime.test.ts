import { expect, test } from "vitest";

import { composeInBandZone, bandZoneParts } from "./bandTime";

test("a September evening composes with the summer offset", () => {
  expect(composeInBandZone("2026-09-05", "10:00")).toBe("2026-09-05T10:00:00+02:00");
});

test("a December evening composes with the winter offset", () => {
  // The season runs September to January, so both offsets are in every
  // planning the committee ever enters. A hard-coded +02:00 would put every
  // winter rehearsal an hour early.
  expect(composeInBandZone("2026-12-05", "10:00")).toBe("2026-12-05T10:00:00+01:00");
});

test("it composes across the autumn change on the day it happens", () => {
  // 25 October 2026 is the Sunday the clocks go back. 10:00 that morning is
  // already CET.
  expect(composeInBandZone("2026-10-24", "10:00")).toBe("2026-10-24T10:00:00+02:00");
  expect(composeInBandZone("2026-10-25", "10:00")).toBe("2026-10-25T10:00:00+01:00");
});

test("it splits a stored UTC instant into the date and time a Fribourg member reads", () => {
  expect(bandZoneParts("2026-09-05T08:00:00.000Z")).toEqual({
    date: "2026-09-05",
    time: "10:00",
  });
});

test("a late event belongs to the Fribourg day, not the UTC one", () => {
  // 23:30 in Fribourg in December is 22:30 UTC the same day; in summer it is
  // 21:30. The trap is the other direction — 00:30 Fribourg is the previous
  // day in UTC — and splitting on the raw ISO string gets it wrong.
  expect(bandZoneParts("2026-09-05T23:30:00.000Z")).toEqual({
    date: "2026-09-06",
    time: "01:30",
  });
});

test("what it splits, it composes back", () => {
  const instant = "2026-12-05T09:00:00.000Z";
  const parts = bandZoneParts(instant);

  expect(new Date(composeInBandZone(parts.date, parts.time)).toISOString()).toBe(instant);
});
