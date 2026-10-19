import { currentLocale, t } from "../i18n";
import { intlTag, type Locale } from "../i18n/locale";

/**
 * When an event happens, as one short line.
 *
 * Always Europe/Zurich, never the browser's zone, pinned by a test: a
 * rehearsal is at 10:00 in Fribourg whether it is read from Fribourg, from
 * Sydney or from a CI runner set to UTC. `App\Support\BandTime` makes the same
 * commitment on the server.
 *
 * An event crossing days renders as a date range, found by comparing the two
 * Fribourg dates.
 *
 * The short form is composed by Intl, not by hand: its weekday comma is
 * idiomatic in both French and German, and `formatRange` supplies the range
 * separator, so this file holds no grammar and needs no translation key.
 *
 *   fr-CH   sam., 03.10.2026 09:00 – dim., 04.10.2026 16:00
 *   de-CH   Sa., 03.10.2026, 09:00 – So., 04.10.2026, 16:00
 *
 * The range keeps the year: the one-day form carries it, and a season runs
 * across New Year, so a two-day event in January is ambiguous without it.
 *
 * A numeric date is only safe because both locales read DD.MM.YYYY. An `en`
 * locale would read `05.12.2026` as 12 May, so a third locale needs this
 * decision revisited.
 */

const ZONE = "Europe/Zurich";

/**
 * The separator between two times, and between the two halves of a range.
 *
 * An en dash between two thin spaces (U+2009), written as escapes because the
 * difference is invisible in a diff, a test failure and an editor.
 * `formatRange` emits exactly this, so the one-day form composed here has to
 * match it. A test asserting ordinary spaces fails with "expected X to be X".
 */
const RANGE_SEPARATOR = "\u2009\u2013\u2009";

/**
 * Built per call and cached per locale, never held in a module-level const.
 *
 * A module-scope `new Intl.DateTimeFormat(...)` stays bound to the locale
 * active when this file was first imported, so formatting happens at render
 * time.
 */
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(shape: "date" | "time" | "range"): Intl.DateTimeFormat {
  const locale: Locale = currentLocale();
  const tag = intlTag(locale);
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
 * The calendar day in Fribourg, as a sortable string.
 *
 * Not the raw ISO strings or Date's getDate(), which both answer in the wrong
 * zone: an event from 23:00 to 01:00 in Fribourg is two days here and one day
 * in UTC, and the Fribourg reading decides how it is described.
 *
 * `en-CA` is not a display locale and must not follow the active one. It
 * yields YYYY-MM-DD, which compares as a string; making it locale-aware would
 * silently break the comparison.
 */
function dayIn(zone: string, value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/**
 * The day and short month for a date badge, in Fribourg like everything else
 * here. A badge is a picture of the date, so it repeats what formatEventWhen
 * says and its caller hides it from screen readers.
 */
export function formatEventDay(startsAt: string): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat(intlTag(currentLocale()), {
    timeZone: ZONE,
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(startsAt));

  return {
    day: parts.find((part) => part.type === "day")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
  };
}

export function formatEventWhen(startsAt: string | null, endsAt: string | null): string {
  // A draft may have neither, or only a start. Saying so beats an "Invalid
  // Date", and a start with no end is still worth showing.
  if (startsAt === null) {
    return t("events.dateMissing");
  }

  const start = new Date(startsAt);

  if (endsAt === null) {
    return `${formatter("date").format(start)}, ${formatter("time").format(start)}`;
  }

  const end = new Date(endsAt);

  if (dayIn(ZONE, startsAt) === dayIn(ZONE, endsAt)) {
    const time = formatter("time");

    return `${formatter("date").format(start)}, ${time.format(start)}${RANGE_SEPARATOR}${time.format(end)}`;
  }

  return formatter("range").formatRange(start, end);
}
