import { currentLocale } from "./i18n";
import { intlTag } from "./i18n/locale";

/**
 * Francs on screen, centimes on the wire.
 *
 * The API never sends or takes a formatted price. `priceCents` is an integer
 * (4500 is CHF 45.00), because binary floating point cannot represent 0.10
 * exactly. Currency formatting belongs beside the language it is rendered in
 * (see RegistrationOptionResource), which is the web side.
 *
 * Every conversion lives here; nothing else in the SPA multiplies or divides
 * by 100.
 */

/**
 * A price as a guest reads it: "CHF 45.00", "CHF 1'234.50".
 *
 * The digits come from CLDR's Swiss money format and the currency is placed
 * by hand, hence `formatToParts`. A plain number formats with a comma in
 * French ("1 234,50"), while CHF formats with a point, as Swiss money is
 * written in every language. But the currency style trails the code
 * ("1'234.50 CHF"), where Swiss invoices put it first, and that placement can
 * change between ICU builds. Dropping the currency part keeps the point and
 * settles the placement.
 *
 * The group separator belongs to CLDR and moves between releases:
 *
 *     CLDR 47 (Node 22.21.1)   fr-CH  U+202F   de-CH  U+2019
 *     CLDR 48 (Node 24.21.0)   fr-CH  U+0027   de-CH  U+0027
 *
 * Which locale this asks is the app's decision; which glyph comes back is
 * CLDR's. So `money.test.ts` watches the tag, never the separator.
 *
 * Built per call, never a module-scope const, for the reason lib/date.ts
 * gives.
 *
 * Two decimals always: a column mixing "CHF 45" and "CHF 45.50" is harder to
 * add up by eye.
 */
export function formatCents(cents: number): string {
  const parts = new Intl.NumberFormat(intlTag(currentLocale()), {
    style: "currency",
    currency: "CHF",
  }).formatToParts(cents / 100);

  const amount = parts
    // The `literal` is the spacing CLDR puts beside the code.
    .filter((part) => part.type !== "currency" && part.type !== "literal")
    .map((part) => part.value)
    .join("");

  // A no-break space, so a narrow table cell on a phone cannot break the line
  // between "CHF" and the figure.
  return `CHF\u00a0${amount}`;
}

/**
 * A price the committee typed, in centimes, or null for an empty field.
 *
 * Null is a real answer, not a parse failure: an option with no price (one
 * whose price lives in its description) differs from one that costs nothing.
 * An empty field means the first, "0" the second.
 *
 * A comma is accepted as the decimal separator, since a French keyboard's
 * numeric pad produces one.
 *
 * `Math.round` on the product: 45.55 * 100 is 4554.999999999999 in IEEE 754.
 */
export function parseFrancs(input: string): number | null | "invalid" {
  const trimmed = input.trim();

  if (trimmed === "") {
    return null;
  }

  // Anchored, with no exponent and no sign. A bare `Number()` takes "1e3" as
  // 1000 and "-5" as a negative price.
  if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) {
    return "invalid";
  }

  return Math.round(Number(trimmed.replace(",", ".")) * 100);
}

/**
 * Centimes as the committee edits them: francs, with decimals only when there
 * are any.
 *
 * Not `formatCents`, which is for reading: this fills a text input, where
 * "CHF 45.00" would be in the way. 4500 comes back as "45", 4550 as "45.50".
 */
export function francsInput(cents: number | null): string {
  if (cents === null) {
    return "";
  }

  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
