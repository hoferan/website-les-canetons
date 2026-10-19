/**
 * The `If-Match` a conditional write owes, as orval's request options.
 *
 * Every write that replaces or removes something is refused without one
 * (`428 if_match_required`) and with a stale one (`412 if_match_failed`). See
 * App\Http\Middleware\ConditionalWrite and the "Conditional writes" section of
 * the API reference.
 *
 * The tag must be the `ETag` of the read the person was looking at when they
 * decided what to write, so a screen reads the one row as it opens the form.
 * A fresh tag fetched just before the write satisfies the server and protects
 * nobody from somebody else's edit.
 *
 * orval's mutation hooks take their request options once, at creation, and
 * their variables type has no room for a header. So a conditional write calls
 * the generated function inside the screen's own `useMutation` and passes
 * this.
 */
export function ifMatch(etag: string): RequestInit {
  return { headers: { "If-Match": etag } };
}

/**
 * The tag a read handed out, or null when it did not.
 *
 * Every route the SPA reads a tag from declares the header; null is modelled
 * because `Headers.get` returns it, and sending the string "null" would be
 * worse than sending nothing.
 */
export function entityTagOf(response: { headers: Headers }): string | null {
  return response.headers.get("ETag");
}
