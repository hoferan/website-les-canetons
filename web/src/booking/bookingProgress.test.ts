import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { setLocale } from "../i18n";
import { actorsText, changesText, closingText, placesText } from "./bookingProgress";

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date("2026-11-01T10:00:00Z"), toFake: ["Date"] });
  await setLocale("fr");
});

afterEach(() => {
  vi.useRealTimers();
});

test("words the changes, leaving out the kinds with none", () => {
  expect(changesText({ new: 2, changed: 1, cancelled: 0 })).toBe("2 nouvelles et 1 modifiée");
  expect(changesText({ new: 0, changed: 0, cancelled: 1 })).toBe("1 annulée");
  expect(changesText({ new: 0, changed: 0, cancelled: 0 })).toBe("");
});

test("names at most three people, then counts the rest", () => {
  expect(actorsText([])).toBe("");
  expect(actorsText(["Paul Direction"])).toBe("par Paul Direction");
  expect(actorsText(["A", "B", "C", "D", "E"])).toBe("par A, B, C et 2 autres");
});

test("counts the days to the close, or says it has closed", () => {
  expect(closingText("2026-11-06T22:59:00Z", false)).toBe("clôture dans 5 jours");
  expect(closingText("2026-11-01T22:00:00Z", false)).toBe("clôture aujourd’hui");
  expect(closingText("2026-10-30T22:59:00Z", true)).toBe("inscriptions closes");
});

test("says how many places are left, or that an option is full", () => {
  expect(placesText({ label: "Viande", remaining: 4 })).toBe("Viande : 4 places restantes");
  expect(placesText({ label: "Viande", remaining: 1 })).toBe("Viande : 1 place restante");
  expect(placesText({ label: "Enfant", remaining: 0 })).toBe("Enfant : complet");
});

test("words it all in German too", async () => {
  await setLocale("de-CH");

  expect(changesText({ new: 2, changed: 0, cancelled: 1 })).toBe("2 neue und 1 stornierte");
  expect(actorsText(["Paul Direction"])).toBe("von Paul Direction");
  expect(closingText("2026-11-06T22:59:00Z", false)).toBe("Anmeldeschluss in 5 Tagen");
  expect(placesText({ label: "Viande", remaining: 0 })).toBe("Viande: ausgebucht");
});
