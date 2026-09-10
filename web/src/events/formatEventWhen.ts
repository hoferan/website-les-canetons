/**
 * When an event happens, in French, as one line.
 *
 * ALWAYS Europe/Zurich, NEVER the browser's zone. This is the single most
 * likely thing for a later change to get wrong, so it is stated here and
 * pinned by a test: a rehearsal is at 10:00 in Fribourg whether it is read
 * from Fribourg, from Sydney, or from a CI runner set to UTC. The member's own
 * location is not a fact about the event. `App\Support\BandTime` makes the
 * same commitment on the server, and for the same reason.
 *
 * A two-day event renders as a date RANGE rather than one date and two times.
 * That falls straight out of comparing the two dates, which is what the old
 * `weekend` boolean was faking — see the events migration (decision C6).
 *
 * THE COMMA AFTER THE WEEKDAY IS Intl's, NOT A CHOICE. `fr-CH` renders
 * "samedi, 5 septembre 2026", and the tests below pin what the formatter
 * actually produced rather than what read best when they were written —
 * measured 2026-09-10. It is comma-heavy in the two-day form ("du samedi,
 * 3 octobre 2026, 09:00 au …"), so it is on the list to look at in a browser
 * before this release ships; changing it means composing the parts by hand,
 * which is a decision to take while looking at the rendered page rather than
 * at a string literal in a test.
 */

const ZONE = "Europe/Zurich";

const DATE = new Intl.DateTimeFormat("fr-CH", {
  timeZone: ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME = new Intl.DateTimeFormat("fr-CH", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The calendar day IN FRIBOURG, as a sortable string.
 *
 * Compared this way rather than on the raw ISO strings, or on Date's own
 * getDate(), because both answer in the wrong zone: an event running
 * 23:00–01:00 in Fribourg is two days in UTC and one day here, and it is the
 * Fribourg reading that decides how it should be described.
 */
function dayIn(zone: string, value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatEventWhen(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (dayIn(ZONE, startsAt) === dayIn(ZONE, endsAt)) {
    return `${DATE.format(start)}, ${TIME.format(start)} – ${TIME.format(end)}`;
  }

  return `du ${DATE.format(start)}, ${TIME.format(start)} au ${DATE.format(end)}, ${TIME.format(end)}`;
}
