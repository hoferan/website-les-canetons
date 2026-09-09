import { expect, test } from "vitest";

import { authLogin, authLogout, authMe, config, contact } from "../api/generated/endpoints";
import { ApiError } from "../api/http";
import { setMockUser } from "./handlers";

/**
 * The mocked backend is a layer the whole suite and the whole dev loop rest on,
 * so it gets its own tests. Going through the GENERATED client rather than
 * fetch() directly is the point: it exercises the same path the app takes,
 * including the mutator's envelope.
 *
 * During the R1a rebuild this only covers what the mocked API still has:
 * /api/config, /api/contact, and auth. The event/signup/altcha coverage that
 * used to live here modeled the domain Task 1 deleted.
 */

test("GET /config answers with the shape the boot gate reads", async () => {
  const result = await config();
  expect(result.status).toBe(200);
  expect(result.data.env).toBe("dev");
});

test("GET /me is 401 for an anonymous caller, which is a normal answer", async () => {
  const error = (await authMe().catch((thrown: unknown) => thrown)) as ApiError;
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(401);
  expect(error.code).toBe("not_authenticated");
});

test("GET /me reports whoever setMockUser logged in", async () => {
  setMockUser("demo.direction");
  const result = await authMe();
  expect(result.data).toEqual({
    id: 1,
    username: "demo.direction",
    firstName: "Dominique",
    lastName: "Direction",
    isPlayer: false,
    mustChangePassword: false,
    permissions: [
      "events.manage",
      "attendance.view_all",
      "attendance.record_for_others",
      "members.manage",
      "registrations.view",
    ],
  });
});

// The whole reason /api/contact is hand-written is its reject branch — both
// failure tests in Contact.test.tsx replace the handler outright, so nothing
// else exercised it.
test("POST /contact rejects a missing field the way the real API does", async () => {
  const error = (await contact({
    lastName: "Canard",
    firstName: "Donald",
    email: "donald@example.com",
    subject: "",
    message: "Coin",
  }).catch((thrown: unknown) => thrown)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  // 400, not Laravel's default 422: every validation failure in this API goes
  // through ApiError::validation(), which ends `self::json(400, ...)`.
  expect(error.status).toBe(400);
  expect(error.code).toBe("validation_failed");
  expect(error.fields).toEqual([{ field: "subject", reason: "required" }]);
});

test("logging in as an unknown username is refused, not a crash", async () => {
  const error = (await authLogin({ username: "nobody", password: "demo" }).catch(
    (thrown: unknown) => thrown,
  )) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(401);
  expect(error.code).toBe("invalid_credentials");
});

test("logging out clears the mocked session", async () => {
  await authLogin({ username: "demo.direction", password: "demo" });

  // Narrowed on status, not a bare .data access: orval types this as a
  // discriminated union of every declared response, same as SessionProvider.
  const loggedIn = await authMe();
  if (loggedIn.status !== 200) {
    throw new Error(`expected 200, got ${loggedIn.status}`);
  }
  expect(loggedIn.data.username).toBe("demo.direction");

  await authLogout();
  const error = (await authMe().catch((thrown: unknown) => thrown)) as ApiError;
  expect(error.status).toBe(401);
});

/* -------------------------------------------------------------------------- *
 * The roster
 * -------------------------------------------------------------------------- */

test("lists the roster ordered by name, not in insertion order", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/members");
  const roster = (await response.json()) as { lastName: string }[];

  expect(response.status).toBe(200);
  expect(roster.map((member) => member.lastName)).toEqual([
    "Both",
    "Committee",
    "Direction",
    "Player",
    "Sansconnexion",
  ]);
});

test("every member on the roster has an account", async () => {
  setMockUser("demo.direction");
  const roster = (await (await fetch("/api/members")).json()) as { username: string }[];

  // 2026_09_08_000001 made credentials NOT NULL: people the band merely
  // displays are content, not members. A mock carrying a login-less row would
  // let a screen be built around a state the database cannot hold.
  expect(roster.every((member) => member.username.length > 0)).toBe(true);
});

test("refuses the roster to a member without members.manage", async () => {
  setMockUser("demo.player");
  const response = await fetch("/api/members");

  // 403, not 401: they ARE logged in. The real routes get this split by pairing
  // auth:sanctum with permission:, and the SPA's guards depend on it.
  expect(response.status).toBe(403);
  expect(((await response.json()) as { code: string }).code).toBe("access_denied");
});

test("refuses the roster to an anonymous caller with 401, not 403", async () => {
  const response = await fetch("/api/members");
  expect(response.status).toBe(401);
});

test("creating a member never mints them a role", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Lea",
      lastName: "Nouvelle",
      username: "lea.nouvelle",
      sectionId: 4,
      publicVisible: false,
    }),
  });
  const created = (await response.json()) as {
    member: {
      roleIds: number[];
      sectionName: string;
      isPlayer: boolean;
      mustChangePassword: boolean;
    };
    generatedPassword: string;
  };

  expect(response.status).toBe(201);
  expect(created.member.roleIds).toEqual([]);
  // Derived from sectionId in the real Resource, so they can never disagree.
  expect(created.member.sectionName).toBe("Cloches");
  expect(created.member.isPlayer).toBe(true);
  expect(created.member.mustChangePassword).toBe(true);
  expect(created.generatedPassword).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
});

test("forgets a created member between tests", async () => {
  setMockUser("demo.direction");
  const before = ((await (await fetch("/api/members")).json()) as unknown[]).length;

  // The assertion that makes every other test in the suite trustworthy: if
  // resetMockState() misses the roster, one test's member leaks into the next
  // and a count assertion fails only when the whole file runs.
  expect(before).toBe(5);
});

test("refuses to delete the last member who can administer members", async () => {
  setMockUser("demo.direction");
  // demo.both holds `direction` too, so remove them first — then Dominique is
  // the last holder and deleting anyone who holds it is refused.
  await fetch("/api/members/3", { method: "DELETE" });
  const response = await fetch("/api/members/1", { method: "DELETE" });

  // 409, not 403: the caller HAS the permission. The request conflicts with
  // the state of the system.
  expect(response.status).toBe(409);
  expect(((await response.json()) as { code: string }).code).toBe(
    "cannot_remove_last_administrator",
  );
});

test("refuses to delete yourself, once someone else can still administer", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/members/1", { method: "DELETE" });

  expect(response.status).toBe(409);
  expect(((await response.json()) as { code: string }).code).toBe("cannot_delete_self");
});

test("refuses to remove your own administration", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/members/1/roles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roleIds: [] }),
  });

  expect(response.status).toBe(409);
  expect(((await response.json()) as { code: string }).code).toBe("cannot_demote_self");
});

test("a destructive roster call needs no password, only the session", async () => {
  setMockUser("demo.direction");
  // Decision B7: the cookie is trusted here, as it already is for reading the
  // whole roster and editing anyone. Mistake-prevention is the type-the-name
  // confirmation in the UI. If re-authentication is ever reintroduced on the
  // roster, this test is what says so.
  const response = await fetch("/api/members/2", { method: "DELETE" });

  expect(response.status).toBe(200);
});

test("changing your own password does need the current one", async () => {
  setMockUser("demo.direction");
  const refused = await fetch("/api/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "wrong", newPassword: "un-mot-de-passe-long" }),
  });

  expect(refused.status).toBe(403);
  expect(((await refused.json()) as { code: string }).code).toBe("reauth_failed");

  const accepted = await fetch("/api/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "demo", newPassword: "un-mot-de-passe-long" }),
  });

  expect(accepted.status).toBe(200);
});

test("the register list is the one the migration seeds", async () => {
  setMockUser("demo.direction");
  const sections = (await (await fetch("/api/sections")).json()) as { name: string }[];

  // Mirrors 2026_09_07_000001 exactly. A synthetic list here would mean every
  // mocked screenshot showed pupitres no server has.
  expect(sections.map((section) => section.name)).toEqual([
    "Batteurs",
    "Grosses-caisses",
    "Lyre",
    "Cloches",
    "Trompettes",
    "Trombones",
  ]);
});

test("roles carry a key and their permissions, and no display name", async () => {
  setMockUser("demo.direction");
  const roles = (await (await fetch("/api/roles")).json()) as Record<string, unknown>[];

  // Decision B6: the UI resolves the French from `key`. A label here would let
  // a screen render a name the real API never sends.
  expect(roles.map((role) => role.key)).toEqual(["direction", "committee"]);
  expect(roles.every((role) => !("label" in role) && !("labelFr" in role))).toBe(true);
});

test("editing a member changes only what the real request validates", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/members/2", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    // roleIds is not an editable field — it has its own endpoint, its own
    // invariants and its own audit. Laravel's validated() drops it silently,
    // so the mock must too, or a screen could be built on a write that does
    // nothing at all in production.
    body: JSON.stringify({ sectionId: null, roleIds: [1] }),
  });
  const member = (await response.json()) as {
    sectionId: number | null;
    sectionName: string | null;
    isPlayer: boolean;
    roleIds: number[];
  };

  expect(response.status).toBe(200);
  // Clearing a register is an explicit null, not an absent field.
  expect(member.sectionId).toBeNull();
  expect(member.sectionName).toBeNull();
  expect(member.isPlayer).toBe(false);
  expect(member.roleIds).toEqual([]);
});
