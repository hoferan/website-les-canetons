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
 * THE WEEKDAY AND THE DATE ARE COMPOSED BY HAND, because `fr-CH` puts a comma
 * between them and French does not. One formatter reading "samedi, 5 septembre
 * 2026" was tolerable; the two-day form it produced was not — "du samedi,
 * 3 octobre 2026, 09:00 au dimanche, 4 octobre 2026, 16:00" carries four
 * commas and the reader has to work out which ones separate the two halves.
 * Looked at on the rendered page on 2026-09-12, which is where the earlier
 * version of this comment said the decision belonged rather than beside a
 * string literal in a test.
 *
 * The two-day form says "à" before each time for the same reason: with the
 * comma gone it is the only thing left marking where the date stops.
 */

const ZONE = "Europe/Zurich";

const WEEKDAY = new Intl.DateTimeFormat("fr-CH", { timeZone: ZONE, weekday: "long" });

const DATE = new Intl.DateTimeFormat("fr-CH", {
  timeZone: ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "samedi 5 septembre 2026" — the two parts joined the way French joins them. */
function dayAndDate(value: Date): string {
  return `${WEEKDAY.format(value)} ${DATE.format(value)}`;
}

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
    return `${dayAndDate(start)}, ${TIME.format(start)} – ${TIME.format(end)}`;
  }

  return `du ${dayAndDate(start)} à ${TIME.format(start)} au ${dayAndDate(end)} à ${TIME.format(end)}`;
}
