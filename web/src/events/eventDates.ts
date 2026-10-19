/**
 * The calendar arithmetic behind the series generator.
 *
 * Pure, and ignorant of timezones. It works on calendar dates as `Y-m-d`
 * strings, and the server turns each into an instant in the band's zone, so
 * "every Saturday from 5 September to 31 October" stays testable as
 * arithmetic.
 *
 * Its own module, like `formatEventWhen`, because this is where date bugs
 * live and a function is easier to test than a rendered screen.
 */

/**
 * Every occurrence of one weekday between two dates, both ends included.
 *
 * `weekday` is `Date.getDay()`: 0 is Sunday, 6 is Saturday.
 *
 * Whole days, not milliseconds. The season runs across the October clock
 * change, so a week of `7 * 24 * 60 * 60 * 1000` drifts by an hour. Stepping
 * the date component in UTC, where no clock changes, cannot drift.
 *
 * The guard matters. The generator recomputes on every keystroke, so it is
 * asked about half-typed ranges constantly, and an unparseable or backwards
 * range would otherwise loop forever and lock the tab.
 */
export function weekdayDatesBetween(from: string, to: string, weekday: number): string[] {
  const first = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);

  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || first > last) {
    return [];
  }

  // Forward to the first matching weekday on or after the start; the modulo
  // never reaches back before it.
  first.setUTCDate(first.getUTCDate() + ((weekday - first.getUTCDay() + 7) % 7));

  const dates: string[] = [];

  for (const cursor = first; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}

/**
 * Whether an event is still a draft: written down, editable, and visible only
 * to people who can manage events. `publishedAt` is the whole state; there is
 * no second flag.
 */
export function isDraft(event: { publishedAt: string | null }): boolean {
  return event.publishedAt === null;
}
