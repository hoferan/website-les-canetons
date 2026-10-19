import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "./i18n";

import { formatCents, francsInput, parseFrancs } from "./money";

/**
 * The no-break space `formatCents` puts between CHF and the figure, written
 * as an escape: a literal one is indistinguishable from a plain space in a
 * diff, a review or an editor.
 */
const NBSP = "\u00a0";

afterEach(async () => {
  vi.restoreAllMocks();
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
   * The separator is `\D` rather than a codepoint, because CLDR changes the
   * character. The app guarantees there is one, and that the decimal stays a
   * point.
   */
  it("groups thousands the Swiss way", () => {
    expect(formatCents(123450)).toMatch(/^CHF\u00a01\D234\.50$/);
  });

  /**
   * The contract is that `Intl` is asked for the reader's locale. The output
   * cannot show it: the separator differs between ICU builds, nothing pins
   * the Node version for a developer, and as of CLDR 48 fr-CH and de-CH
   * render money identically. So this spies on the tag, and fails on every
   * build if `formatCents` stops consulting the reader.
   */
  it("asks Intl for the reader's own locale", async () => {
    const asked: string[] = [];
    const Real = Intl.NumberFormat;

    vi.spyOn(Intl, "NumberFormat").mockImplementation(function (
      tag?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      asked.push(String(tag));
      return new Real(tag, options);
    } as unknown as typeof Intl.NumberFormat);

    formatCents(123450);
    await setLocale("de-CH");
    formatCents(123450);

    expect(asked).toEqual(["fr-CH", "de-CH"]);
  });

  /**
   * What money.ts places by hand, so what holds in both languages whatever
   * ICU is installed: the code in front, the no-break space, a decimal point
   * and two digits.
   */
  it("puts CHF in front with a no-break space, in both languages", async () => {
    const swiss = /^CHF\u00a0\d\D?\d{3}\.50$/;

    expect(formatCents(123450)).toMatch(swiss);

    await setLocale("de-CH");
    expect(formatCents(123450)).toMatch(swiss);
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
   * 45.55 * 100 is 4554.999999999999 in IEEE 754; truncating loses a rappen.
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
