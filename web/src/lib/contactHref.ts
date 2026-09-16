/**
 * Turns a stored contact detail into an `href`, or refuses.
 *
 * THE DOCTRINE IS `Join.tsx:26`'s: a clickable number that is wrong dials a
 * stranger. Refusing to link costs nothing — the value still renders, as the
 * plain text it has always been — so every added refusal is a no-regression
 * and every wrong link is a new harm. When in doubt, return null.
 *
 * NEITHER FUNCTION VALIDATES. `POST /api/v1/registrations` already validated:
 * `email` against Laravel's `email` rule, `phone` as
 * `['required', 'string', 'max:64']` — free text, "in whatever form the guest
 * writes it" (`StoreRegistrationRequest:80`). So `phone` can be
 * `079 123 45 67`, `+41 79 123 45 67`, `079/123.45.67` or `à demander`, and
 * this module's job is to decide which of those can safely become a link.
 *
 * THE DISPLAYED VALUE IS NEVER REWRITTEN. Callers render what was stored and
 * link what was sanitised. That is also what makes this forward-compatible
 * with normalising `phone` to E.164 in the API: sanitising an already-clean
 * number is a no-op, so the front end does not change again when the backend
 * does.
 */

/**
 * A dialable `tel:` URI, or null.
 *
 * The refusals are the interesting part:
 *
 * - ANY UNICODE LETTER refuses. `079 123 45 67 p. 12` has twelve digits and
 *   would otherwise produce `tel:079123456712`, which reaches nobody or
 *   reaches the wrong person. `(privé)`, `ou au bureau`, `ext 4` and
 *   `à demander` all carry letters, and all of them mean read the field rather
 *   than tap it.
 * - A `+` THAT IS NOT LEADING refuses. `079+123` and `+41 79 123+45 67` are
 *   two things, not one number.
 * - MORE THAN FIFTEEN DIGITS refuses: fifteen is E.164's ceiling for a whole
 *   number including the country code, so above it the value is two numbers
 *   run together, or a number plus an account reference. Under three, nothing
 *   is dialable anywhere on earth.
 * - NON-ASCII DIGITS are stripped like any other character and are NOT
 *   transliterated. A `tel:` URI is ASCII (RFC 3966), and turning `٠٧٩` into
 *   `079` would emit a dial string that does not visibly correspond to the
 *   text beside it — a homoglyph surface, and unreadable evidence if it ever
 *   dials wrong.
 *
 * THERE IS NO LENGTH CAP ON THE INPUT, deliberately. The output is bounded by
 * the digit ceiling and by its own alphabet, so mirroring the column's
 * `max:64` here could only ever turn a correct link into no link. A test pins
 * this so nobody adds one back.
 *
 * KNOWN LIMITATION: `+41 (0)79 123 45 67` keeps the trunk prefix and yields
 * `tel:+410791234567`. Dropping a `(0)` correctly is E.164 normalisation,
 * which is a separate issue. The result fails to connect rather than reaching
 * a stranger, so it falls on the safe side of the doctrine above, and a test
 * pins the behaviour so that issue can change it deliberately.
 */
export function telHref(phone: string): string | null {
  // trim() removes NBSP too, so a value stored with one cannot hide the `+`.
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+");
  const rest = plus ? trimmed.slice(1) : trimmed;

  if (rest.includes("+")) {
    return null;
  }

  if (/\p{L}/u.test(rest)) {
    return null;
  }

  const digits = rest.replace(/[^0-9]/g, "");

  if (digits.length < 3 || digits.length > 15) {
    return null;
  }

  return `tel:${plus ? "+" : ""}${digits}`;
}

/**
 * A `mailto:` URI, or null.
 *
 * PERCENT-ENCODED, NOT FILTERED THROUGH A BLOCKLIST, and the difference is the
 * whole safety argument. RFC 6068's header fields (`?subject=`, `&bcc=`) begin
 * at a LITERAL `?`, so a URI containing no literal `?` and no literal `&`
 * cannot carry one. `encodeURIComponent` escapes both, which makes that a
 * structural invariant holding for every input — including the ones nobody
 * enumerated — rather than a list of characters somebody has to keep current.
 *
 * A blocklist would also be wrong in the other direction: RFC 5322 `atext`
 * includes `&` and `?`, so `jean&marie@example.ch` is an address the API
 * accepts, and refusing to link it would be a bug rather than a defence.
 *
 * `%` BECOMES `%25`, which is the point most easily missed. A stored `%3F`
 * left alone survives into the URI and a handler that percent-decodes before
 * splitting on `?` reads a header field out of it. Escaping the escape closes
 * that path.
 *
 * `+` BECOMES `%2B`, deliberately. RFC 6068 permits a literal `+`, but some
 * handlers form-decode the whole URI, where `+` means a space and would
 * silently corrupt `jean+souper@example.ch` into `jean souper@example.ch`.
 * `%2B` round-trips under both readings. Do not "tidy" it away; a test pins it.
 *
 * THE `@` STAYS LITERAL and the two halves are encoded separately, because
 * encoding the whole string would emit `%40` where RFC 6068's grammar wants
 * the delimiter. The split is on the LAST `@`: a domain cannot contain one, a
 * quoted local part can.
 */
export function mailtoHref(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");

  // A STRUCTURAL CHECK, NOT A VALIDATION — the server's `email` rule is the
  // validation. This asks only "is there something on each side of an @",
  // which is what separates an address from `à demander`.
  if (at <= 0 || at === trimmed.length - 1) {
    return null;
  }

  try {
    const local = encodeURIComponent(trimmed.slice(0, at));
    const domain = encodeURIComponent(trimmed.slice(at + 1));
    return `mailto:${local}@${domain}`;
  } catch {
    // encodeURIComponent throws URIError on a lone surrogate. One malformed
    // stored address must not blank the whole guest list.
    return null;
  }
}
