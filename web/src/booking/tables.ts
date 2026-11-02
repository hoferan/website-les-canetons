/** A table already booked at an event, and how many people sit at it. */
export type TableChoice = { name: string; guests: number };

/**
 * The tables a list of bookings sits at, the way EventTables::of() builds them
 * on the server: a table is its name trimmed and compared exactly, so "Müller"
 * and "müller" stay two tables, as two unrelated families may both pick it.
 */
export function tablesOf(
  bookings: { tableName: string | null; guestCount: number }[],
): TableChoice[] {
  const guests = new Map<string, number>();
  for (const booking of bookings) {
    const name = booking.tableName?.trim() ?? "";
    if (name !== "") {
      guests.set(name, (guests.get(name) ?? 0) + booking.guestCount);
    }
  }

  return [...guests]
    .map(([name, count]) => ({ name, guests: count }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr-CH", { sensitivity: "base", numeric: true }));
}
