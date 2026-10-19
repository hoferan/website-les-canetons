/**
 * What an anonymous form owes the API, as orval's request options.
 *
 * `POST /contact` and `POST /events/{event}/registrations` are the only two
 * endpoints a stranger may write to, and both refuse a submission without all
 * three of these (`App\Http\Middleware\PublicWriteGuard` and
 * `App\Http\Middleware\IdempotentWrite`).
 *
 * `X-Form-Token` is a signed stamp from `GET /api/v1/form-token`, fetched when
 * the form renders: the server refuses one under two seconds old, so a token
 * minted on the click is refused. A query that refetches on focus would hand
 * the form a fresher token, which cannot work, so pin the query.
 *
 * `Idempotency-Key` is generated once per rendered form and reused for every
 * attempt at that submission, so a second tap sends one message, not two. A
 * failed attempt releases its key server-side, so a retry keeps the same one.
 *
 * The honeypot is a field, not a header: every one of these forms sends
 * `website: ""`, and a body that omits it is refused like one that fills it.
 *
 * As with `ifMatch`, the generated mutation hooks cannot carry headers per
 * call, so a public write calls the generated function inside the screen's
 * own `useMutation`.
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
 * ASCII window, and available in every supported browser and in jsdom.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
