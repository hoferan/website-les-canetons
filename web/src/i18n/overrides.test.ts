import { afterEach, expect, test } from "vitest";

import { setLocale, t } from ".";
import { applyOverrides, catalogueValue } from "./overrides";

const row = (key: string, fr: string | null, de: string | null) => ({
  key,
  fr,
  de,
  updatedAt: "2026-11-02T10:00:00+00:00",
});

afterEach(() => applyOverrides([]));

test("an FR override shows in French and, without a German value, in German too", async () => {
  applyOverrides([row("join.facts.schedule.time", "De 9h à 11h", null)]);

  expect(t("join.facts.schedule.time")).toBe("De 9h à 11h");
  await setLocale("de-CH");
  expect(t("join.facts.schedule.time")).toBe("De 9h à 11h");
});

test("a German value wins on the German page", async () => {
  applyOverrides([row("join.facts.schedule.time", "De 9h à 11h", "Von 9 bis 11 Uhr")]);

  await setLocale("de-CH");
  expect(t("join.facts.schedule.time")).toBe("Von 9 bis 11 Uhr");
});

test("a German value alone leaves the French catalogue wording", async () => {
  applyOverrides([row("join.facts.schedule.time", null, "Von 9 bis 11 Uhr")]);

  expect(t("join.facts.schedule.time")).toBe(catalogueValue("fr", "join.facts.schedule.time"));
  await setLocale("de-CH");
  expect(t("join.facts.schedule.time")).toBe("Von 9 bis 11 Uhr");
});

test("a removed override restores the catalogue in both languages", async () => {
  const french = t("join.facts.schedule.time");
  await setLocale("de-CH");
  const german = t("join.facts.schedule.time");
  await setLocale("fr");

  applyOverrides([row("join.facts.schedule.time", "De 9h à 11h", "Von 9 bis 11 Uhr")]);
  applyOverrides([]);

  expect(t("join.facts.schedule.time")).toBe(french);
  await setLocale("de-CH");
  expect(t("join.facts.schedule.time")).toBe(german);
});

test("a key the catalogue does not have is ignored", () => {
  // A text stored by a newer build, or a key since renamed, must not appear
  // anywhere: nothing renders it, and it must not break the others.
  applyOverrides([row("gone.away", "x", null), row("join.intro", "Bonjour", null)]);

  expect(t("join.intro")).toBe("Bonjour");
});
