import { expect, test } from "vitest";

import { loginStatus } from "./loginStatus";

// One case per combination of the two fields. All four are reachable, which is
// why the status names all four rather than letting one field win: a
// provisional password never used may never have reached the person, while one
// already used means they are in and have not finished. Different phone calls.

test("a provisional password that has never been used says both things", () => {
  expect(loginStatus({ mustChangePassword: true, lastLoginAt: null })).toBe(
    "Aucune connexion, mot de passe provisoire",
  );
});

test("a provisional password that has been used keeps the date", () => {
  expect(loginStatus({ mustChangePassword: true, lastLoginAt: "2026-09-01T19:30:00+02:00" })).toBe(
    "Dernière connexion le 1 septembre 2026, mot de passe provisoire",
  );
});

test("an account that has never been used says so", () => {
  expect(loginStatus({ mustChangePassword: false, lastLoginAt: null })).toBe("Aucune connexion");
});

test("an account in use reads as its last login", () => {
  expect(loginStatus({ mustChangePassword: false, lastLoginAt: "2026-09-01T19:30:00+02:00" })).toBe(
    "Dernière connexion le 1 septembre 2026",
  );
});

// A regression guard on the wording that was rejected: "Jamais connecté" would
// need the participle to agree with the member, and this codebase has no
// inclusive-writing convention to reach for. This only pins the `connecté`
// stem, not every gendered participle in French — a different agreeing word
// (e.g. "inscrit") would not be caught here.
test("no rendered status carries a participle that agrees with the member", () => {
  const every = [
    loginStatus({ mustChangePassword: true, lastLoginAt: null }),
    loginStatus({ mustChangePassword: true, lastLoginAt: "2026-09-01T19:30:00+02:00" }),
    loginStatus({ mustChangePassword: false, lastLoginAt: null }),
    loginStatus({ mustChangePassword: false, lastLoginAt: "2026-09-01T19:30:00+02:00" }),
  ];
  for (const status of every) {
    expect(status).not.toMatch(/connecté/i);
  }
});
