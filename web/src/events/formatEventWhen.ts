import { currentLocale } from "../i18n";
import { intlTag, type Locale } from "../i18n/locale";

/**
 * When an event happens, as one short line.
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
 * SHORT, AND COMPOSED BY Intl RATHER THAN BY HAND (#162). This file used to
 * build the weekday and the date itself, because `fr-CH` puts a comma between
 * them and long-form French does not — "samedi, 5 septembre 2026" was
 * tolerable and its two-day form was not. That is no longer a problem worth
 * solving: in the SHORT form the comma is idiomatic in both French and German,
 * so each locale's own punctuation is simply correct.
 *
 * Deleting that composition took the whole French sentence with it. The
 * two-day form was "du … à … au … à …", where each `à` existed only to mark
 * where the date stopped once the comma had been removed. `formatRange` now
 * supplies the separator, so there is no French grammar left in this file and
 * nothing here needs a translation key.
 *
 *   fr-CH   sam., 03.10.2026 09:00 – dim., 04.10.2026 16:00
 *   de-CH   Sa., 03.10.2026, 09:00 – So., 04.10.2026, 16:00
 *
 * The year is kept in the range even though dropping it would save eight more
 * characters: the one-day form carries it, and a Guggenmusik season runs
 * across New Year, so a two-day event in January is genuinely ambiguous
 * without it.
 *
 * A NUMERIC DATE IS ONLY SAFE BECAUSE BOTH SHIPPED LOCALES READ DD.MM.YYYY.
 * `05.12.2026` is 5 December in fr-CH and de-CH alike. An `en` locale would
 * read it as 12 May, so a third locale needs this decision revisited rather
 * than extended.
 */

const ZONE = "Europe/Zurich";

/**
 * The separator between two times, and between the two halves of a range.
 *
 * EN DASH BETWEEN TWO THIN SPACES (U+2009), NOT ORDINARY SPACES, and written
 * as escapes because the difference is invisible in a diff, in a test failure
 * and in an editor. This is not a preference: `formatRange` below emits
 * exactly this, so the one-day form -- which is composed here -- has to match
 * it or the same screen shows two different dashes. A test asserting the
 * range with ordinary spaces fails with "expected X to be X".
 */
const RANGE_SEPARATOR = "\u2009\u2013\u2009";

/**
 * Built per call and cached per locale, never held in a module-level const.
 *
 * A module-scope `new Intl.DateTimeFormat(...)` is bound to whatever locale was
 * active when this file was first imported, and a later locale change does not
 * move it — the rule the whole i18n effort follows: format at render time.
 */
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(shape: "date" | "time" | "range"): Intl.DateTimeFormat {
  const locale: Locale = currentLocale();
  const tag = intlTag(locale, "short");
  const key = `${tag}|${shape}`;

  let found = cache.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(tag, { timeZone: ZONE, ...OPTIONS[shape] });
    cache.set(key, found);
  }

  return found;
}

const OPTIONS: Record<"date" | "time" | "range", Intl.DateTimeFormatOptions> = {
  date: { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit" },
  range: {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
};

/**
 * The calendar day IN FRIBOURG, as a sortable string.
 *
 * Compared this way rather than on the raw ISO strings, or on Date's own
 * getDate(), because both answer in the wrong zone: an event running
 * 23:00–01:00 in Fribourg is two days in UTC and one day here, and it is the
 * Fribourg reading that decides how it should be described.
 *
 * `en-CA` IS NOT A DISPLAY LOCALE AND MUST NOT FOLLOW THE ACTIVE ONE. It is
 * chosen because it yields YYYY-MM-DD, which sorts and compares as a string.
 * Making this locale-aware would silently break the comparison.
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
    const time = formatter("time");

    return `${formatter("date").format(start)}, ${time.format(start)}${RANGE_SEPARATOR}${time.format(end)}`;
  }

  return formatter("range").formatRange(start, end);
}
