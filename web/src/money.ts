/**
 * Francs on screen, centimes on the wire.
 *
 * THE API NEVER SENDS A FORMATTED PRICE and never takes one. `priceCents` is
 * an integer: 4500 is CHF 45.00. Binary floating point cannot represent 0.10
 * exactly, and money that is a rappen out in the tenth row is money the
 * committee reconciles by hand. RegistrationOptionResource's own docblock
 * carries the other half of this: currency formatting belongs beside the
 * language it is rendered in, and for this project that is the web side.
 *
 * So every conversion between the two lives here, and nothing else in the SPA
 * multiplies or divides by 100.
 */

/**
 * A price as a guest reads it: "CHF 45.00", "CHF 1'234.50".
 *
 * THE DIGITS COME FROM CLDR'S SWISS MONEY FORMAT AND THE CURRENCY IS PLACED
 * BY HAND, which is why this goes through `formatToParts` instead of reading a
 * formatted string.
 *
 * Both halves of that were measured. `fr-CH` formatting a plain number gives
 * "1'234,50", with a COMMA, while the same locale formatting CHF gives
 * "1'234.50", because Switzerland writes money with a point in all three of
 * its languages. The currency style is therefore the only one that produces
 * the separator a price list needs. What it also produces is "1'234.50 CHF",
 * the code trailing, where every Swiss invoice and menu writes it first, and
 * that placement is CLDR's to change between ICU builds, so two browsers could
 * render one guest list two different ways. Dropping the currency part keeps
 * the first and settles the second.
 *
 * Two decimals always, including on a round figure. A column mixing "CHF 45"
 * and "CHF 45.50" is harder to add up by eye than one that does not.
 */
export function formatCents(cents: number): string {
  const parts = new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
  }).formatToParts(cents / 100);

  const amount = parts
    // The `literal` is the spacing CLDR puts beside the code, and it exists
    // only to separate the two things being re-joined below.
    .filter((part) => part.type !== "currency" && part.type !== "literal")
    .map((part) => part.value)
    .join("");

  // A no-break space: "CHF" and the figure are one thing, and a narrow table
  // cell on a phone is exactly where a plain space breaks the line between
  // them.
  return `CHF\u00a0${amount}`;
}

/**
 * A price the committee typed, in centimes, or null for an empty field.
 *
 * Null is a real answer here rather than a parse failure: an option with no
 * price at all is expressible on purpose, for one whose price lives in its
 * description, and that is a different thing from an option that costs
 * nothing. An empty field means the first, "0" means the second.
 *
 * A COMMA IS ACCEPTED AS THE DECIMAL SEPARATOR, because it is what a French
 * keyboard's numeric pad produces and what somebody writing Swiss prices by
 * hand types. Refusing "45,50" as malformed would be correct and useless.
 *
 * `Math.round` on the product, never the product as it stands: 45.55 * 100 is
 * 4554.999999999999 in IEEE 754, and truncating that is five rappen short.
 */
export function parseFrancs(input: string): number | null | "invalid" {
  const trimmed = input.trim();

  if (trimmed === "") {
    return null;
  }

  // Anchored, with no exponent and no sign: a price is digits, optionally a
  // separator and one or two more. A bare `Number()` here takes "1e3" as 1000
  // and "-5" as a negative price.
  if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) {
    return "invalid";
  }

  return Math.round(Number(trimmed.replace(",", ".")) * 100);
}

/**
 * Centimes as the committee edits them: francs, with decimals only when there
 * are any.
 *
 * NOT `formatCents`, deliberately. That one is for reading a price; this one
 * fills a text input somebody then corrects, and "CHF 45.00" is not a thing
 * anybody wants to edit by hand. 4500 comes back as "45", 4550 as "45.50".
 */
export function francsInput(cents: number | null): string {
  if (cents === null) {
    return "";
  }

  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
