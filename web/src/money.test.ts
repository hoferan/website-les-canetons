import { describe, expect, it } from "vitest";

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

describe("formatCents", () => {
  it("renders centimes as Swiss francs with both decimals", () => {
    expect(formatCents(4500)).toBe(`CHF${NBSP}45.00`);
    expect(formatCents(4550)).toBe(`CHF${NBSP}45.50`);
  });

  it("renders a free option as zero rather than as nothing", () => {
    expect(formatCents(0)).toBe(`CHF${NBSP}0.00`);
  });

  /**
   * The half that IS the locale's to decide. fr-CH groups with an apostrophe,
   * which is why the grouping still goes through Intl even though the
   * currency does not.
   */
  it("groups thousands the Swiss way", () => {
    expect(formatCents(123450)).toMatch(/^CHF\u00a01\D234\.50$/);
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
