/**
 * The `If-Match` a conditional write owes, as orval's request options.
 *
 * Every write that replaces or removes something is refused without one —
 * `428 if_match_required` — and refused with a stale one — `412
 * if_match_failed`. See App\Http\Middleware\ConditionalWrite, and the
 * "Conditional writes" section of the API reference.
 *
 * WHERE THE TAG COMES FROM IS THE WHOLE POINT. It must be the `ETag` of the
 * read the person was looking at when they decided what to write — which is
 * why a screen reads the one row as it opens the form, rather than writing
 * from the row it already had in a list. Fetching a fresh tag immediately
 * before the write would satisfy the server and protect nobody: the window it
 * is meant to cover is the one where somebody else was editing.
 *
 * THE GENERATED HOOKS CANNOT CARRY THIS. orval's mutation hooks take their
 * request options once, when the hook is created, while the tag differs per
 * call; their variables type is generated and has no room for a header. So a
 * conditional write calls the generated FUNCTION inside the screen's own
 * `useMutation`, and passes this. The function, its types and its error
 * handling are still the generated ones — only the hook wrapper is not.
 */
export function ifMatch(etag: string): RequestInit {
  return { headers: { "If-Match": etag } };
}

/**
 * The tag a read handed out, or null when it did not.
 *
 * Null is not expected: every route the SPA reads a tag from declares the
 * header. It is modelled because `Headers.get` says so, and because sending
 * the string "null" would be worse than being refused for sending nothing.
 */
export function entityTagOf(response: { headers: Headers }): string | null {
  return response.headers.get("ETag");
}
