const LONG = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

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
  return LONG.format(parseLocalDate(iso));
}

/** A weekend event spans the given day and the next. */
export function formatEventDateRange(iso: string): string {
  const start = parseLocalDate(iso);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return `${LONG.format(start)} au ${LONG.format(end)}`;
}

/** "19:00:00" -> "19:00". The API returns a SQL TIME; only hours and minutes are shown. */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}
