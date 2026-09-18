import { expect, test } from "vitest";

import { loginState } from "./loginStatus";

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
