/**
 * Turns a stored contact detail into an `href`, or refuses.
 *
 * A wrong clickable number dials a stranger, while refusing to link costs
 * nothing (the value still renders as plain text). When in doubt, return null.
 *
 * Neither function validates; the API did. `phone` is free text
 * (StoreRegistrationRequest), so it can be `079 123 45 67`,
 * `+41 79 123 45 67`, `079/123.45.67` or `à demander`, and this module decides
 * which of those can safely become a link.
 *
 * Callers render what was stored and link what was sanitised. Sanitising an
 * already-clean E.164 number is a no-op.
 */

/**
 * A dialable `tel:` URI, or null.
 *
 * What refuses:
 *
 * - Any Unicode letter. `079 123 45 67 p. 12` would otherwise dial
 *   `tel:079123456712`; `(privé)`, `ext 4` and `à demander` all mean read the
 *   field rather than tap it.
 * - A `+` that is not leading: `079+123` is two things, not one number.
 * - More than fifteen digits, E.164's ceiling including the country code, so
 *   two numbers run together. Under three, nothing is dialable anywhere.
 * - Non-ASCII digits are stripped, not transliterated: a `tel:` URI is ASCII
 *   (RFC 3966), and `٠٧٩` dialled as `079` would not visibly match the text.
 *
 * There is no cap on the input length: the output is bounded by the digit
 * ceiling, so mirroring the column's `max:64` could only lose a correct link.
 *
 * Known limitation: `+41 (0)79 123 45 67` keeps the trunk prefix and yields
 * `tel:+410791234567`, which fails to connect rather than reaching a
 * stranger. ContactLink dials the API's `phoneE164` when there is one, so this
 * is only the fallback for a number the API could not read.
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
 * Percent-encoded rather than filtered through a blocklist. RFC 6068's header
 * fields (`?subject=`, `&bcc=`) begin at a literal `?`, and
 * `encodeURIComponent` escapes `?` and `&`, so no input can carry one. A
 * blocklist would also refuse valid addresses: RFC 5322 `atext` includes `&`
 * and `?`.
 *
 * `%` becomes `%25`, so a stored `%3F` cannot turn into a `?` in a handler
 * that percent-decodes before splitting.
 *
 * `+` becomes `%2B`: some handlers form-decode the whole URI, where `+` means
 * a space and `jean+souper@` would become `jean souper@`. A test pins it.
 *
 * The `@` stays literal and the halves are encoded separately, split on the
 * last `@`: a domain cannot contain one, a quoted local part can.
 */
export function mailtoHref(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");

  // A structural check; the server's `email` rule is the validation. Something
  // on each side of an @ separates an address from `à demander`.
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
