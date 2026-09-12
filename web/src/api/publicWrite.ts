/**
 * What an anonymous form owes the API, as orval's request options.
 *
 * `POST /contact` and `POST /events/{event}/registrations` are the only two
 * endpoints a stranger may write to, and both refuse a submission that does
 * not carry all three of these — see `App\Http\Middleware\PublicWriteGuard`
 * and `App\Http\Middleware\IdempotentWrite`.
 *
 * `X-Form-Token` is a signed stamp from `GET /api/v1/form-token`. IT MUST BE
 * FETCHED WHEN THE FORM IS RENDERED, NOT WHEN IT IS SUBMITTED: the server
 * refuses one under two seconds old, so a token minted on the click is refused
 * on the click. That makes it the same shape of trap as the `ETag` a
 * conditional write quotes — a query that refetches on a focus change would
 * hand the form a fresher token than the one it opened with, and a fresh token
 * is the one value that cannot work. Pin the query.
 *
 * `Idempotency-Key` is generated once per rendered form and reused for every
 * attempt at THAT submission, so a stalled connection and a second tap send
 * one message rather than two. A failed attempt releases its key server-side,
 * which is why a retry after a rejection keeps the same one.
 *
 * The honeypot is not here, because it is a FIELD rather than a header: every
 * one of these forms sends `website: ""`, present and empty. A body that omits
 * it is refused exactly like one that fills it in.
 *
 * THE GENERATED MUTATION HOOKS CANNOT CARRY THIS, for the reason `ifMatch`
 * documents: their request options are fixed when the hook is created and
 * their variables type has no room for a header. A public write therefore
 * calls the generated FUNCTION inside the screen's own `useMutation`.
 */
export function publicWriteHeaders(formToken: string, idempotencyKey: string): RequestInit {
  return {
    headers: {
      "X-Form-Token": formToken,
      "Idempotency-Key": idempotencyKey,
    },
  };
}

/**
 * A key for one rendered form.
 *
 * `crypto.randomUUID()` is 36 characters, inside the API's 16-255 printable
 * ASCII window. It is available in every browser this site supports and in
 * jsdom, so there is no fallback branch to test.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
