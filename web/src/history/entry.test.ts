import { Flag } from "lucide-react";
import { describe, expect, test } from "vitest";

import type { HistoryEntryResource } from "../api/generated/model";
import { historyDate, iconFor, shownIn } from "./entry";

const entry = (fields: Partial<HistoryEntryResource>): HistoryEntryResource => ({
  id: 1,
  occurredOn: "2002-10-01",
  precision: "month",
  titleFr: null,
  bodyFr: null,
  titleDe: null,
  bodyDe: null,
  important: false,
  icon: null,
  createdAt: "2026-09-26T00:00:00Z",
  updatedAt: "2026-09-26T00:00:00Z",
  ...fields,
});

describe("shownIn: the language is chosen per entry, never per field", () => {
  test("both languages: each page shows its own", () => {
    const both = entry({ titleFr: "Début", titleDe: "Anfang" });
    expect(shownIn(both, "fr")).toEqual({
      lang: "fr",
      fallback: false,
      title: "Début",
      body: null,
    });
    expect(shownIn(both, "de-CH")).toEqual({
      lang: "de-CH",
      fallback: false,
      title: "Anfang",
      body: null,
    });
  });

  test("French only: the German page shows French, marked as a fallback", () => {
    const fr = entry({ bodyFr: "Texte" });
    expect(shownIn(fr, "de-CH")).toEqual({
      lang: "fr",
      fallback: true,
      title: null,
      body: "Texte",
    });
  });

  test("German only: the French page shows German, marked as a fallback", () => {
    const de = entry({ titleDe: "Anfang" });
    expect(shownIn(de, "fr")).toEqual({
      lang: "de-CH",
      fallback: true,
      title: "Anfang",
      body: null,
    });
  });

  test("a French title and a German text never appear together", () => {
    const mixed = entry({ titleFr: "Début", bodyDe: "Text" });
    expect(shownIn(mixed, "fr")).toEqual({
      lang: "fr",
      fallback: false,
      title: "Début",
      body: null,
    });
    expect(shownIn(mixed, "de-CH")).toEqual({
      lang: "de-CH",
      fallback: false,
      title: null,
      body: "Text",
    });
  });
});

describe("historyDate", () => {
  test("a year is just the year", () => {
    expect(historyDate("2019-01-01", "year", "fr")).toBe("2019");
  });

  test("a month is spelled out in the page's language", () => {
    expect(historyDate("2002-10-01", "month", "fr")).toBe("octobre 2002");
    expect(historyDate("2002-10-01", "month", "de-CH")).toBe("Oktober 2002");
  });

  test("a day is numeric, Swiss style", () => {
    expect(historyDate("2023-11-11", "day", "fr")).toBe("11.11.2023");
  });

  test("the first of January is not shifted into the previous year", () => {
    // vitest.config.ts runs in America/New_York on purpose, five hours west
    // of UTC, where a formatter that lost its zone shows 31 December.
    expect(historyDate("2007-01-01", "year", "fr")).toBe("2007");
    expect(historyDate("2007-01-01", "day", "fr")).toBe("01.01.2007");
  });
});

describe("iconFor", () => {
  test("a known key maps to its icon", () => {
    expect(iconFor("flag")).toBe(Flag);
  });

  test("an unknown key falls back to the plain dot rather than throwing", () => {
    expect(iconFor("rocket")).toBeNull();
    expect(iconFor(null)).toBeNull();
  });
});
