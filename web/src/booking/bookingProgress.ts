import type {
  EventBookingsFactsResourceChanges,
  EventBookingsFactsResourceNearlyFullItem,
} from "../api/generated/model";
import { currentLocale, t } from "../i18n";

/**
 * The words for an event's booking progress (#123), shared by the inbox row
 * and the guest list's read line.
 *
 * The API sends numbers; the sentences are built here so French and German
 * each get their own grammar. Lists go through Intl.ListFormat, which knows
 * where each language puts its "et" and "und".
 */

/** Names shown before the rest are counted. */
const NAMED = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

function joined(parts: string[]): string {
  return new Intl.ListFormat(currentLocale(), { type: "conjunction" }).format(parts);
}

/** "2 nouvelles et 1 modifiée"; kinds with none are left out, nothing at all is "". */
export function changesText(changes: EventBookingsFactsResourceChanges): string {
  const parts: string[] = [];
  if (changes.new > 0) {
    parts.push(t("inbox.eventBookings.new", { count: changes.new }));
  }
  if (changes.changed > 0) {
    parts.push(t("inbox.eventBookings.changed", { count: changes.changed }));
  }
  if (changes.cancelled > 0) {
    parts.push(t("inbox.eventBookings.cancelled", { count: changes.cancelled }));
  }
  return joined(parts);
}

/** "par Paul Direction"; past three names, "et 2 autres". Nobody is "". */
export function actorsText(actors: string[]): string {
  if (actors.length === 0) {
    return "";
  }
  const named = actors.slice(0, NAMED);
  const rest = actors.length - named.length;
  const names = rest > 0 ? [...named, t("inbox.eventBookings.others", { count: rest })] : named;
  return t("inbox.eventBookings.by", { names: joined(names) });
}

/** "clôture dans 5 jours", "clôture aujourd’hui", or "inscriptions closes". */
export function closingText(closesAt: string, closed: boolean): string {
  if (closed) {
    return t("inbox.eventBookings.closed");
  }
  const days = Math.floor((new Date(closesAt).getTime() - Date.now()) / DAY_MS);
  return days < 1
    ? t("inbox.eventBookings.closesToday")
    : t("inbox.eventBookings.closesIn", { count: days });
}

/** "Viande : 4 places restantes", or "Enfant : complet". */
export function placesText(option: EventBookingsFactsResourceNearlyFullItem): string {
  return option.remaining === 0
    ? t("inbox.eventBookings.full", { label: option.label })
    : t("inbox.eventBookings.left", { label: option.label, count: option.remaining });
}
