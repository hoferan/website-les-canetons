import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { loginState } from "./loginStatus";

afterEach(async () => {
  await setLocale("fr");
});

// The roster's job here is to make the committee LOOK at the rows it has to do
// something about (#94). So the two facts split by what they are for: a state
// somebody must act on becomes a pill, and the last-login date stays plain
// reference text. An account in normal use therefore has no pill at all —
// that absence is the signal.

test("a provisional password that has never been used raises both pills", () => {
  const state = loginState({ mustChangePassword: true, lastLoginAt: null });

  expect(state.pills.map((pill) => pill.label)).toEqual(["Jamais utilisé", "Provisoire"]);
  expect(state.lastLogin).toBeNull();
});

test("a provisional password that has been used keeps the date and one pill", () => {
  const state = loginState({
    mustChangePassword: true,
    lastLoginAt: "2026-09-01T19:30:00+02:00",
  });

  expect(state.pills.map((pill) => pill.label)).toEqual(["Provisoire"]);
  expect(state.lastLogin).toBe("Dernière connexion le 1 septembre 2026");
});

test("an account that has never been used raises one pill and no date", () => {
  const state = loginState({ mustChangePassword: false, lastLoginAt: null });

  expect(state.pills.map((pill) => pill.label)).toEqual(["Jamais utilisé"]);
  expect(state.lastLogin).toBeNull();
});

// The case the pills exist to be silent about. A roster where every row has a
// pill is a roster where a pill means nothing.
test("an account in normal use raises no pill at all", () => {
  const state = loginState({
    mustChangePassword: false,
    lastLoginAt: "2026-09-01T19:30:00+02:00",
  });

  expect(state.pills).toEqual([]);
  expect(state.lastLogin).toBe("Dernière connexion le 1 septembre 2026");
});

// `Provisoire` alone is not a sentence, and a screen reader hears the label
// with no card around it to supply the missing noun.
test("the terse pill carries a fuller accessible name", () => {
  const [pill] = loginState({ mustChangePassword: true, lastLoginAt: null }).pills.filter(
    (candidate) => candidate.label === "Provisoire",
  );

  expect(pill?.accessibleName).toBe("Mot de passe provisoire");
});

// A regression guard on the specific wording that was rejected: `Jamais
// connecté` has to agree with the member, and this codebase has no
// inclusive-writing convention to reach for. `utilisé` agrees with `le compte`
// instead, so it is safe. This pins that one stem and nothing wider — an
// agreeing word like `inscrit` would pass it.
test("no pill uses the participle that would agree with the member", () => {
  const combinations = [
    { mustChangePassword: true, lastLoginAt: null },
    { mustChangePassword: true, lastLoginAt: "2026-09-01T19:30:00+02:00" },
    { mustChangePassword: false, lastLoginAt: null },
    { mustChangePassword: false, lastLoginAt: "2026-09-01T19:30:00+02:00" },
  ];

  for (const fields of combinations) {
    for (const pill of loginState(fields).pills) {
      expect(pill.label).not.toMatch(/connecté/i);
      expect(pill.accessibleName).not.toMatch(/connecté/i);
    }
  }
});

test("the pills and the date are German, and the date keeps its own preposition", async () => {
  // `formatLastLogin` was made locale-aware in #151; the words AROUND it were
  // not. "Dernière connexion le X" against "Letzte Anmeldung am X" — the
  // preposition differs and it is not part of the date, so the whole sentence
  // comes from the catalogue rather than being glued together here.
  //
  // The French label also avoids a participle that would have to agree with
  // the member ("jamais utilisé" agrees with `le compte`). German has no such
  // constraint — see the note in fr.ts, which exists so nobody "simplifies"
  // the French to match the German.
  await setLocale("de-CH");

  const state = loginState({ mustChangePassword: true, lastLoginAt: "2026-09-01T19:30:00+02:00" });

  expect(state.pills.map((pill) => pill.label)).toEqual(["Provisorisch"]);
  expect(state.pills.map((pill) => pill.accessibleName)).toEqual(["Provisorisches Passwort"]);
  expect(state.lastLogin).toBe("Letzte Anmeldung am 1. September 2026");
});

test("a never-used account raises both pills in German", async () => {
  await setLocale("de-CH");

  const state = loginState({ mustChangePassword: true, lastLoginAt: null });

  expect(state.pills.map((pill) => pill.label)).toEqual(["Nie benutzt", "Provisorisch"]);
  expect(state.pills.map((pill) => pill.accessibleName)).toEqual([
    "Konto nie benutzt",
    "Provisorisches Passwort",
  ]);
  expect(state.lastLogin).toBeNull();
});
