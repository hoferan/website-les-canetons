import { currentLocale, t } from "../i18n";
import { intlTag, type Locale } from "../i18n/locale";

/**
 * FORMATTERS ARE BUILT ON DEMAND AND CACHED PER LOCALE, never held in a
 * module-level const.
 *
 * A module-scope `new Intl.DateTimeFormat(...)` is bound to whatever locale was
 * active when this file was first imported, and a later locale change does not
 * move it. Building on demand is also cheap — Intl caches internally — and a
 * small map keeps it to one construction per locale per shape.
 */
/**
 * The three date shapes this app renders, each with the Intl tag family it
 * belongs to.
 *
 * KEYED BY SHAPE, NOT BY TAG FAMILY. `instant` and `lastLogin` both resolve to
 * fr-CH in French, so a cache keyed on the tag alone would hand the
 * time-bearing formatter to formatLastLogin or the other way round, depending
 * only on which was called first. That is a bug that passes in isolation and
 * fails when the whole file runs.
 */
const SHAPES = {
  long: {
    kind: "long",
    options: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  },
  instant: {
    kind: "instant",
    options: {
      timeZone: "Europe/Zurich",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  },
  lastLogin: {
    // `instant` as a TAG FAMILY: last-login has always formatted with fr-CH
    // like the other instants, even though its shape drops the time of day.
    // Only the long-date shape uses fr-FR.
    kind: "instant",
    options: { timeZone: "Europe/Zurich", day: "numeric", month: "long", year: "numeric" },
  },
} as const satisfies Record<
  string,
  { kind: "long" | "instant"; options: Intl.DateTimeFormatOptions }
>;

type Shape = keyof typeof SHAPES;

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(shape: Shape): Intl.DateTimeFormat {
  const locale: Locale = currentLocale();
  const { kind, options } = SHAPES[shape];
  const tag = intlTag(locale, kind);
  const key = `${tag}|${shape}`;

  let found = cache.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(tag, options);
    cache.set(key, found);
  }

  return found;
}

/**
 * Parses "YYYY-MM-DD" as a LOCAL date.
 *
 * `new Date("2026-12-05")` is UTC midnight, which renders as the 4th anywhere
 * west of Greenwich — so an event would show the wrong day for a visitor in the
 * Americas, and the right one here, which is the hardest kind of bug to see
 * from Fribourg. The old front end parsed local for the same reason.
 */
function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function formatEventDate(iso: string): string {
  return formatter("long").format(parseLocalDate(iso));
}

/** A weekend event spans the given day and the next. */
export function formatEventDateRange(iso: string): string {
  const start = parseLocalDate(iso);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const long = formatter("long");

  return `${long.format(start)}${t("dates.rangeSeparator")}${long.format(end)}`;
}

/** "19:00:00" -> "19:00". The API returns a SQL TIME; only hours and minutes are shown. */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/**
 * A last-login instant as a date: "1 septembre 2026", or "1. September 2026".
 *
 * NO TIME, unlike formatInstant below. A contact message is a worklist item
 * whose minute matters; a last login is read as "recently or not", and the
 * minute only makes the longest line on a roster card longer.
 *
 * THE TIMEZONE IS PINNED, and that is not cosmetic: the API sends UTC, and an
 * evening login in Fribourg is the previous day in UTC. Formatted in the
 * viewer's zone it would also differ between two committee members reading the
 * same roster.
 */
export function formatLastLogin(iso: string): string {
  return formatter("lastLogin").format(new Date(iso));
}

/**
 * An instant as a date and a time: "15 septembre 2026 à 12:05", or
 * "15. September 2026 um 12:05".
 *
 * ONE FUNCTION FOR TWO SCREENS (#147). Inbox.tsx and ContactMessages.tsx each
 * held a byte-identical private copy of this — same options, same docblock,
 * differing only in their own private name. Both screens' tests assert the
 * rendered string, so the French output here is exactly what those two
 * produced.
 *
 * (Both of those docblocks claimed the output was "le 15 septembre 2026,
 * 12:05". It never was — there is no leading "le" and the separator is "à".
 * The stale text was not carried forward.)
 *
 * DISTINCT FROM formatLastLogin, which drops the time of day. A contact
 * message is a worklist item whose minute matters; a last login is read as
 * "recently or not". #147 says so explicitly and it is easy to collapse by
 * mistake.
 */
export function formatInstant(iso: string): string {
  return formatter("instant").format(new Date(iso));
}
