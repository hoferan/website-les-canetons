/**
 * Reading a collection out of a generated query result.
 *
 * Every list endpoint answers `{data, meta}` (see the API reference's
 * *Collections* section), and orval wraps every response again in
 * `{status, data, headers}`. So the rows of a list live two `data` deep, and a
 * screen that reaches for them writes `roster.data.data.data` — three
 * identically named hops, of which only the middle one is the envelope.
 * Whichever hop somebody drops, the compiler is happy and the screen is empty.
 *
 * `rowsOf` is that hop, with the status narrowing it needs. The narrowing earns
 * its place: orval types a query as a discriminated union of every DECLARED
 * response, so the payload is not an envelope until `status` picks a branch.
 * The mutator throws on anything but a 2xx, so the error branch never arrives
 * as a resolved value at runtime — but the type is right that it could, and an
 * `as` here would be a lie the compiler stops checking.
 */

/** One page of a collection, as every list endpoint answers it. */
type Envelope<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

/**
 * What a generated query resolves to: the envelope, or a declared failure.
 *
 * `data: unknown` rather than a union of the declared shapes, because every
 * collection endpoint generates its own envelope type (`MemberIndex200`,
 * `EventIndex200`, …) and they are structurally identical. Narrowing on
 * `status` and then reading through `Envelope<T>` says the same thing once.
 */
type Result = { status: number; data: unknown } | undefined;

/**
 * Any 2xx, not `status === 200`.
 *
 * `POST /events/series` answers **201** with a collection — the events it just
 * created — and a helper that tested for 200 would hand its caller an empty
 * list for a season that was generated successfully.
 */
function succeeded(result: Result): result is { status: number; data: unknown } {
  return result !== undefined && result.status >= 200 && result.status < 300;
}

/**
 * The rows of a collection, or an empty list while it is loading or refused.
 *
 * An empty list rather than `undefined` on purpose: a screen renders "aucun
 * membre" for an empty roster and for a roster it has not received yet, and
 * distinguishing them is the query's `isPending`, not the shape of the rows.
 */
export function rowsOf<T>(result: Result): T[] {
  if (!succeeded(result)) {
    return [];
  }

  // The isArray check does not negotiate over the shape. This API answers
  // `{data, meta}` and nothing else, and Tests\Feature\PaginationTest is what
  // proves it. The check is here for what happens when that stops being true:
  // the alternative to an empty list is `undefined.length` inside a component,
  // which React turns into a blank page for the whole route.
  const rows = (result.data as Partial<Envelope<T>>).data;

  return Array.isArray(rows) ? rows : [];
}

/**
 * How many rows the whole collection holds, or null when none has arrived.
 *
 * This is the half a bare array could not carry: `total` counts the collection
 * on the server, not the page that was sent, so a screen can say "45 membres"
 * without having been handed forty-five of them. Null, not 0, because "not yet
 * known" and "none" are different things to put on a screen.
 */
export function totalOf(result: Result): number | null {
  if (!succeeded(result)) {
    return null;
  }

  const total = (result.data as Partial<Envelope<unknown>>).meta?.total;

  return typeof total === "number" ? total : null;
}
