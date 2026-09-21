import { currentLocale } from "../i18n";
import { intlTag, type Locale } from "../i18n/locale";

/**
 * The two date shapes this app renders.
 *
 * FORMATTERS ARE BUILT ON DEMAND AND CACHED PER LOCALE, never held in a
 * module-level const. A module-scope `new Intl.DateTimeFormat(...)` is bound to
 * whatever locale was active when this file was first imported, and a later
 * locale change does not move it. Building on demand is also cheap — Intl
 * caches internally — and a small map keeps it to one construction per locale
 * per shape.
 *
 * KEYED BY SHAPE, NOT BY LOCALE TAG. Both resolve to the same tag, so a cache
 * keyed on the tag alone would hand the time-bearing formatter to formatDay or
 * the other way round, depending only on which was called first. That is a bug
 * that passes in isolation and fails when the whole file runs.
 *
 * BOTH PIN Europe/Zurich, and after #161 every date formatter in the app pins
 * a zone — see the timezone test in ./date.test.ts. The one that did not was
 * the long-date shape, which is why this file used to carry a parseLocalDate
 * helper: a date-only string parsed as UTC midnight renders as the previous
 * day west of Greenwich. Nothing renders a bare date through this module any
 * more; the calendar and the series preview parse "YYYY-MM-DDT00:00:00Z" and
 * format in UTC, which is the same fix from the other side.
 */
const SHAPES = {
  instant: {
    timeZone: "Europe/Zurich",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  day: {
    timeZone: "Europe/Zurich",
    day: "numeric",
    month: "long",
    year: "numeric",
  },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

type Shape = keyof typeof SHAPES;

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(shape: Shape): Intl.DateTimeFormat {
  const locale: Locale = currentLocale();
  const tag = intlTag(locale);
  const key = `${tag}|${shape}`;

  let found = cache.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(tag, SHAPES[shape]);
    cache.set(key, found);
  }

  return found;
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
  return formatDay(iso);
}

/**
 * An instant as the DAY it falls on in Fribourg: "1 septembre 2026",
 * "1. September 2026".
 *
 * THE SAME SHAPE AS formatLastLogin, under a name that does not claim a
 * login. EventBooking.tsx held a private `dayIn` with byte-identical options
 * and a hardcoded `fr-CH`, which is the third time this file has had a copy
 * living somewhere else: Inbox and ContactMessages each held one of
 * formatInstant until #147. Same failure, same fix.
 *
 * The timezone is pinned for the reason formatLastLogin gives: a registration
 * closing at 23:00 in Fribourg is the next day in UTC, and two committee
 * members in different places must read one deadline the same way.
 */
export function formatDay(iso: string): string {
  return formatter("day").format(new Date(iso));
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
