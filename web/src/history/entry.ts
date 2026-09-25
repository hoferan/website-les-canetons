import {
  Flag,
  Heart,
  type LucideIcon,
  MapPin,
  Music,
  PartyPopper,
  Star,
  Trophy,
  Users,
} from "lucide-react";

import type { HistoryEntryResource } from "../api/generated/model";
import { t } from "../i18n";
import { intlTag, type Locale } from "../i18n/locale";

/** The server's closed set (App\Support\HistoryIcon), mirrored. */
export const HISTORY_ICONS = {
  flag: Flag,
  star: Star,
  music: Music,
  trophy: Trophy,
  users: Users,
  "party-popper": PartyPopper,
  "map-pin": MapPin,
  heart: Heart,
} as const satisfies Record<string, LucideIcon>;

export type HistoryIconKey = keyof typeof HISTORY_ICONS;

/**
 * The icon for a key, or null for the plain dot.
 *
 * A key this bundle does not know is the plain dot too, so an older bundle
 * still draws the page when the server has learned a newer icon.
 */
export function iconFor(key: string | null): LucideIcon | null {
  return key !== null && Object.hasOwn(HISTORY_ICONS, key)
    ? HISTORY_ICONS[key as HistoryIconKey]
    : null;
}

export type ShownEntry = {
  lang: Locale;
  fallback: boolean;
  title: string | null;
  body: string | null;
};

/**
 * Which language an entry is shown in on a page in `locale`.
 *
 * PER ENTRY, NEVER PER FIELD: an entry shows its own-language fields if it has
 * either of them, otherwise the other language's, so a French title never sits
 * over a German text. ADR 0026.
 */
export function shownIn(entry: HistoryEntryResource, locale: Locale): ShownEntry {
  const fr = { lang: "fr" as Locale, title: entry.titleFr, body: entry.bodyFr };
  const de = { lang: "de-CH" as Locale, title: entry.titleDe, body: entry.bodyDe };
  const own = locale === "fr" ? fr : de;
  const other = locale === "fr" ? de : fr;
  const chosen = own.title !== null || own.body !== null ? own : other;
  return { ...chosen, fallback: chosen !== own };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, precision: "month" | "day"): Intl.DateTimeFormat {
  const key = `${locale}|${precision}`;
  let found = formatters.get(key);
  if (!found) {
    // IN UTC, because `occurredOn` is a bare calendar date read back at UTC
    // midnight; formatting it in Fribourg, or in the test suite's New York,
    // would show the previous day. SeriesForm's previewDate does the same.
    found = new Intl.DateTimeFormat(intlTag(locale), {
      timeZone: "UTC",
      ...(precision === "month"
        ? { month: "long", year: "numeric" }
        : { day: "2-digit", month: "2-digit", year: "numeric" }),
    });
    formatters.set(key, found);
  }
  return found;
}

/** `2019`, `octobre 2002` / `Oktober 2002`, or `11.11.2023`, per the entry's precision. */
export function historyDate(occurredOn: string, precision: string, locale: Locale): string {
  const date = new Date(`${occurredOn}T00:00:00Z`);
  if (precision === "year") {
    return String(date.getUTCFullYear());
  }
  return formatter(locale, precision === "month" ? "month" : "day").format(date);
}

/**
 * "de 2007", "d'octobre 2002", "du 11.11.2023" / "von 2007", "vom 11.11.2023":
 * the date with the preposition an untitled entry is named by.
 *
 * The preposition is the catalogue's; only which of its four forms applies is
 * decided here, from the precision and, for a month, from whether the month
 * name starts with a vowel (French elides "de" before "août" or "octobre").
 */
export function dateWithPreposition(occurredOn: string, precision: string, locale: Locale): string {
  const date = historyDate(occurredOn, precision, locale);
  const form =
    precision === "day"
      ? "day"
      : precision === "month"
        ? /^[aeiouyàâäéèêëîïôöûüh]/i.test(date)
          ? "monthVowel"
          : "month"
        : "year";
  return t(`history.of.${form}`, { date });
}
