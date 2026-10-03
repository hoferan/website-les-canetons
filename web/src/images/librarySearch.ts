/**
 * Searching and sorting the library, on the client (#105). The library holds
 * a hundred photos at most and `GET /images` returns all of them, so asking
 * the server again for every keystroke would cost a request and buy nothing.
 */

export const LIBRARY_ORDERS = ["newest", "oldest", "name", "largest"] as const;
export type LibraryOrder = (typeof LIBRARY_ORDERS)[number];

type Sortable = { id: number; name: string; createdAt: string; bytes: number };

/** Lower case and without accents, so "repet" finds "Répétition". */
function folded(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

/** Whether the name contains the query, ignoring case and accents. A blank query matches every name. */
export function matchesName(name: string, query: string): boolean {
  const wanted = folded(query.trim());
  return wanted === "" || folded(name).includes(wanted);
}

/**
 * A sorted copy. "newest" is the API's own order, the higher id first on the
 * same instant; the other orders fall back to it, so two photos that tie
 * never swap places between renders.
 */
export function sortImages<T extends Sortable>(
  images: T[],
  order: LibraryOrder,
  locale: string,
): T[] {
  const newest = (a: T, b: T) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id;
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });

  const compare: Record<LibraryOrder, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => -newest(a, b),
    name: (a, b) => collator.compare(a.name, b.name) || newest(a, b),
    largest: (a, b) => b.bytes - a.bytes || newest(a, b),
  };

  return [...images].sort(compare[order]);
}
