/**
 * Reading a collection out of a generated query result.
 *
 * Every list endpoint answers `{data, meta}` (see the API reference's
 * *Collections* section), and orval wraps every response again in
 * `{status, data, headers}`. So the rows live at `roster.data.data.data`, and
 * whichever hop somebody drops, the compiler is happy and the screen is empty.
 *
 * `rowsOf` is that hop, with the status narrowing it needs: orval types a
 * query as a union of every declared response, so the payload is not an
 * envelope until `status` picks a branch. The mutator throws on anything but a
 * 2xx, so the error branch never resolves at runtime, but an `as` here would
 * stop the compiler checking.
 */

/** One page of a collection, as every list endpoint answers it. */
type Envelope<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

/**
 * What a generated query resolves to: the envelope, or a declared failure.
 *
 * `data: unknown`, because every collection endpoint generates its own
 * envelope type (`MemberIndex200`, `EventIndex200`, …) and they are
 * structurally identical, so `Envelope<T>` says it once.
 */
type Result = { status: number; data: unknown } | undefined;

/**
 * Any 2xx, not `status === 200`.
 *
 * `POST /events/series` answers 201 with the events it created.
 */
function succeeded(result: Result): result is { status: number; data: unknown } {
  return result !== undefined && result.status >= 200 && result.status < 300;
}

/**
 * The rows of a collection, or an empty list while it is loading or refused.
 *
 * A screen that needs to tell "loading" from "empty" asks the query's
 * `isPending`, not the shape of the rows.
 */
export function rowsOf<T>(result: Result): T[] {
  if (!succeeded(result)) {
    return [];
  }

  // Tests\Feature\PaginationTest pins the `{data, meta}` shape. The isArray
  // check covers the day it breaks: `undefined.length` inside a component
  // blanks the whole route.
  const rows = (result.data as Partial<Envelope<T>>).data;

  return Array.isArray(rows) ? rows : [];
}

/**
 * How many rows the whole collection holds, or null when none has arrived.
 *
 * `total` counts the collection on the server, not the page that was sent.
 * Null rather than 0, because "not yet known" and "none" read differently.
 */
export function totalOf(result: Result): number | null {
  if (!succeeded(result)) {
    return null;
  }

  const total = (result.data as Partial<Envelope<unknown>>).meta?.total;

  return typeof total === "number" ? total : null;
}
