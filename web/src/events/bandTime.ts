/**
 * Where the wire's UTC and the band's wall clock meet, on the browser side.
 *
 * The server has `App\Support\BandTime` and makes exactly this commitment for
 * exactly this reason: a rehearsal is at 10:00 in Fribourg whether the page is
 * read from Fribourg, from Sydney, or from a CI runner set to UTC.
 * Europe/Zurich is not "the member's timezone", it is a property of the band,
 * so it is a constant here rather than anything read from the browser.
 *
 * THE FORM IS WHY THIS DIRECTION EXISTS. Rendering only ever goes one way —
 * `formatEventWhen` turns an instant into French — but a form has to go both:
 * split a stored instant into the date and time boxes an organiser edits, and
 * compose what they typed back into an instant. Getting the second one wrong
 * is silent: every event lands an hour out for half the season, and nobody
 * finds out until somebody arrives at the wrong time.
 *
 * WHY NOT `new Date("2026-09-05T10:00")`. An offsetless string is read in the
 * BROWSER's zone, so the same typed rehearsal becomes a different instant for
 * a committee member travelling, and a different one again in a test runner.
 * Nor can the offset be hard-coded: the season runs September to January, so
 * both +02:00 and +01:00 occur in every planning ever entered here.
 */

const ZONE = "Europe/Zurich";

/**
 * The zone's own reading of an instant, field by field.
 *
 * `formatToParts` rather than parsing a formatted string: the separators,
 * the order and the padding of a locale's output are all free to change, and
 * `hourCycle: "h23"` is what stops midnight being rendered as hour 24 — which
 * `Date.UTC` would silently roll into the next day.
 */
const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type Fields = { year: number; month: number; day: number; hour: number; minute: number };

function fieldsAt(instant: Date): Fields {
  const read = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };

  for (const part of PARTS.formatToParts(instant)) {
    if (part.type in read) {
      read[part.type as keyof typeof read] = Number(part.value);
    }
  }

  return read;
}

/** How far ahead of UTC the band's zone was at a given instant, in minutes. */
function offsetMinutesAt(utcMs: number): number {
  const local = fieldsAt(new Date(utcMs));

  const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);

  // Rounded to the minute: the difference is a whole number of minutes for
  // every zone in use, and utcMs may carry milliseconds that are not.
  return Math.round((asIfUtc - utcMs) / 60_000);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A `Y-m-d` date and an `H:i` time, as typed for a Fribourg event, as an ISO
 * string carrying the offset that applied on that date.
 *
 * TWO PASSES, NOT ONE, and the second is the whole reason this is a function
 * rather than a template string. The first guess reads the offset at the wrong
 * instant — it uses the wall-clock numbers as though they were UTC, which is
 * off by the offset itself — so on the two days a year the clocks change, the
 * guess can land on the wrong side of the transition. Re-reading the offset at
 * the corrected instant settles it.
 *
 * The offset is sent rather than a bare local string because the wire format
 * would otherwise be ambiguous: the server honours an offset it is given and
 * reads an offsetless string as UTC, so an omission is an error that looks
 * like a two-hour scheduling mistake.
 *
 * A time in the spring-forward gap or the autumn overlap resolves to one of
 * the two plausible instants rather than being refused, matching what
 * `BandTime::compose` does on the server for the same reason: no band event is
 * ever scheduled in the 02:00–03:00 window this affects.
 */
export function composeInBandZone(date: string, time: string): string {
  const wallClockAsUtc = Date.parse(`${date}T${time}:00Z`);

  const guessed = wallClockAsUtc - offsetMinutesAt(wallClockAsUtc) * 60_000;
  const offset = offsetMinutesAt(guessed);

  const sign = offset < 0 ? "-" : "+";
  const size = Math.abs(offset);

  return `${date}T${time}:00${sign}${pad(Math.floor(size / 60))}:${pad(size % 60)}`;
}

/**
 * A stored instant as the date and time boxes an organiser reads and edits.
 *
 * The Fribourg day, never the UTC one: an event at 00:30 in Fribourg is the
 * previous day in UTC, and slicing the ISO string — which is the obvious thing
 * to reach for — puts it in the form a day early.
 */
export function bandZoneParts(iso: string): { date: string; time: string } {
  const local = fieldsAt(new Date(iso));

  return {
    date: `${local.year}-${pad(local.month)}-${pad(local.day)}`,
    time: `${pad(local.hour)}:${pad(local.minute)}`,
  };
}
