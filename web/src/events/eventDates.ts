/**
 * The calendar arithmetic behind the series generator.
 *
 * PURE, AND DELIBERATELY IGNORANT OF TIMEZONES. It manipulates calendar dates
 * as `Y-m-d` strings, and the server turns each of them into an instant using
 * the band's own zone. That split is what keeps this testable as arithmetic:
 * "every Saturday from 5 September to 31 October" is a question about a
 * calendar, and the answer does not change with where anybody is standing.
 *
 * It is its own module rather than a closure inside the generator for the same
 * reason `formatEventWhen` is: this is where the date bugs will be, and a
 * function is far easier to argue with than a rendered screen.
 */

/**
 * Every occurrence of one weekday between two dates, both ends included.
 *
 * `weekday` is `Date.getDay()`: 0 is Sunday, 6 is Saturday.
 *
 * WHOLE DAYS, NOT MILLISECONDS. Adding `7 * 24 * 60 * 60 * 1000` is the
 * obvious implementation and it is wrong: the band's season runs across the
 * October clock change, so a week measured in milliseconds drifts by an hour
 * and the season eventually lands on a Friday. Stepping the date component
 * inside UTC — where no clock ever changes — cannot drift.
 *
 * THE LOOP IS GUARDED, and the guard is the point rather than defensive
 * habit. The generator recomputes on every keystroke, so it is asked about a
 * half-typed range constantly: an unparseable or backwards range makes every
 * comparison false, the loop never terminates, and the tab locks up while
 * somebody is typing a date. An empty list is the right answer to "which
 * Saturdays fall in no range".
 */
export function weekdayDatesBetween(from: string, to: string, weekday: number): string[] {
  const first = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);

  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || first > last) {
    return [];
  }

  // Forward to the first matching weekday on or after the start. The modulo
  // keeps it forward: a range starting the day after the weekday waits for
  // next week rather than reaching back before its own start.
  first.setUTCDate(first.getUTCDate() + ((weekday - first.getUTCDay() + 7) % 7));

  const dates: string[] = [];

  for (const cursor = first; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}
