import { afterEach, describe, expect, it } from "vitest";

import { setLocale } from "./i18n";

import { formatCents, francsInput, parseFrancs } from "./money";

/**
 * The no-break space `formatCents` puts between CHF and the figure, written
 * as an escape rather than as itself.
 *
 * A literal one is indistinguishable from a plain space in a diff, in a
 * review and in an editor, so a test asserting the wrong character would pass
 * or fail for a reason nobody could see. This also states the thing the
 * function exists to guarantee: "CHF" and the amount are one unit and a narrow
 * table cell on a phone must not break the line between them.
 */
const NBSP = "\u00a0";

afterEach(async () => {
  await setLocale("fr");
});

describe("formatCents", () => {
  it("renders centimes as Swiss francs with both decimals", () => {
    expect(formatCents(4500)).toBe(`CHF${NBSP}45.00`);
    expect(formatCents(4550)).toBe(`CHF${NBSP}45.50`);
  });

  it("renders a free option as zero rather than as nothing", () => {
    expect(formatCents(0)).toBe(`CHF${NBSP}0.00`);
  });

  /**
   * The half that IS the locale's to decide — and it decides differently per
   * language, which this comment used to deny. It said "fr-CH groups with an
   * apostrophe"; measured, fr-CH groups with a NARROW NO-BREAK SPACE and only
   * de-CH uses the apostrophe. The loose `\D` below is why the error survived:
   * it matches either.
   */
  it("groups thousands the Swiss way", () => {
    expect(formatCents(123450)).toMatch(/^CHF\u00a01\D234\.50$/);
  });

  it("GROUPS BY THE READER'S OWN CONVENTION, not always French's", async () => {
    // The decimal point is shared — Switzerland writes money with a point in
    // all three of its languages, which money.ts says and is right about. The
    // GROUP separator is not shared, and it is reachable: a souper's booking
    // total across thirty guests clears CHF 1000 on the guest list.
    //
    // Asserted as the invariant rather than as exact codepoints, because the
    // separator is CLDR's to change between ICU builds — the same fragility
    // the `\D` above was hedging against.
    const french = formatCents(123450);

    await setLocale("de-CH");
    const german = formatCents(123450);

    expect(german).toContain("'");
    expect(french).not.toContain("'");
    expect(french).not.toBe(german);

    // Both keep the point, and both keep the hand-placed currency in front.
    expect(french).toMatch(/^CHF\u00a0.*\.50$/);
    expect(german).toBe("CHF\u00a01'234.50");
  });
});

describe("parseFrancs", () => {
  it("reads francs and returns centimes", () => {
    expect(parseFrancs("45")).toBe(4500);
    expect(parseFrancs("45.50")).toBe(4550);
  });

  it("accepts the comma a French keyboard produces", () => {
    expect(parseFrancs("45,50")).toBe(4550);
  });

  /**
   * 45.55 * 100 is 4554.999999999999 in IEEE 754. Truncating instead of
   * rounding loses a rappen per line, which is the whole reason the wire
   * carries integers.
   */
  it("rounds rather than truncating the float", () => {
    expect(parseFrancs("45.55")).toBe(4555);
    expect(parseFrancs("0.07")).toBe(7);
  });

  it("reads an empty field as no price at all, which is not zero", () => {
    expect(parseFrancs("")).toBeNull();
    expect(parseFrancs("   ")).toBeNull();
    expect(parseFrancs("0")).toBe(0);
  });

  it("refuses what a price field must not accept", () => {
    // Number() would take the first three: "1e3" is 1000, "-5" is -5, and
    // "45.555" is a price to a tenth of a rappen.
    expect(parseFrancs("1e3")).toBe("invalid");
    expect(parseFrancs("-5")).toBe("invalid");
    expect(parseFrancs("45.555")).toBe("invalid");
    expect(parseFrancs("gratuit")).toBe("invalid");
  });
});

describe("francsInput", () => {
  it("gives a round price no decimals to edit around", () => {
    expect(francsInput(4500)).toBe("45");
    expect(francsInput(0)).toBe("0");
  });

  it("keeps the rappen when there are any", () => {
    expect(francsInput(4550)).toBe("45.50");
  });

  it("leaves the field empty for an option with no price", () => {
    expect(francsInput(null)).toBe("");
  });
});
