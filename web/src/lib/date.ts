import { currentLocale } from "../i18n";
import { intlTag, type Locale } from "../i18n/locale";

/**
 * The two date shapes this app renders.
 *
 * Formatters are built on demand and cached, never held in a module-level
 * const: one built at import time keeps the locale active then.
 *
 * The cache key holds the shape as well as the locale tag. Both shapes share
 * a tag, so a key on the tag alone would hand one shape's formatter to the
 * other, depending on which was called first.
 *
 * Both pin Europe/Zurich, as every date formatter in the app pins a zone (see
 * the timezone test in ./date.test.ts). A bare date never goes through this
 * module: the calendar and the series preview parse "YYYY-MM-DDT00:00:00Z"
 * and format in UTC, since a date-only string parsed as UTC midnight renders
 * as the previous day west of Greenwich.
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
 * No time, unlike formatInstant: a last login is read as "recently or not",
 * and the minute only lengthens the longest line on a roster card.
 *
 * The zone is pinned because the API sends UTC: an early-morning login in
 * Fribourg is the previous day in UTC, and two committee members in different
 * zones must read the same roster the same way.
 */
export function formatLastLogin(iso: string): string {
  return formatDay(iso);
}

/**
 * An instant as the DAY it falls on in Fribourg: "1 septembre 2026",
 * "1. September 2026".
 *
 * The same shape as formatLastLogin, under a name that does not claim a
 * login. Use these helpers rather than a private Intl.DateTimeFormat copy.
 *
 * The zone is pinned for the reason formatLastLogin gives: two committee
 * members in different places must read one deadline the same way.
 */
export function formatDay(iso: string): string {
  return formatter("day").format(new Date(iso));
}

/**
 * An instant as a date and a time: "15 septembre 2026 à 12:05", or
 * "15. September 2026 um 12:05".
 *
 * Distinct from formatLastLogin, which drops the time of day: a contact
 * message is a worklist item whose minute matters.
 */
export function formatInstant(iso: string): string {
  return formatter("instant").format(new Date(iso));
}
