import { afterEach, describe, expect, it, vi } from "vitest";

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
   * The separator is deliberately `\D` rather than a codepoint, because which
   * character CLDR puts there is CLDR's to change, and it has changed once
   * already in this file's short life. What the app guarantees is that there
   * IS one, and that the decimal beside it stays a point.
   */
  it("groups thousands the Swiss way", () => {
    expect(formatCents(123450)).toMatch(/^CHF\u00a01\D234\.50$/);
  });

  /**
   * THE READER'S LOCALE IS WHAT `Intl` IS ASKED. That is the contract, and it
   * is the one thing here that no CLDR release can quietly erase.
   *
   * IT USED TO BE ASSERTED THROUGH THE SEPARATOR, which is exactly why it
   * broke (#180). The test read "de-CH groups with a straight apostrophe and
   * fr-CH does not", and that pair of claims is true on precisely one of the
   * three builds now known to run it:
   *
   *     Node 22.21.1  CLDR 47   fr-CH U+202F   de-CH U+2019   line 1 false
   *     Node 22.23.2  CLDR ?    (what CI runs, where it passed)
   *     Node 24.21.0  CLDR 48   fr-CH U+0027   de-CH U+0027   line 2 false
   *
   * Measured on the first and third; the middle is inferred from a green CI
   * run, since the old assertions could only pass where de-CH used U+0027 and
   * fr-CH did not. Nothing pins the Node version for a developer, so which of
   * the three you get is an accident of your machine.
   *
   * As of CLDR 48 the two locales render money identically, so nothing
   * downstream of `Intl` can tell them apart at all.
   *
   * So this watches the TAG rather than the output. It fails on every ICU
   * build if `formatCents` stops consulting the reader, INCLUDING the builds
   * where the two locales happen to render the same. That is the case the old
   * assertion could not survive, and the reason this one is a spy.
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
   * WHAT money.ts PLACES BY HAND, as against what it takes from CLDR, and so
   * what must hold in both languages whatever ICU is installed: the code in
   * front, the no-break space after it, a point for the decimal and two
   * digits behind it.
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
