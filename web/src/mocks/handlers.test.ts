import { expect, test } from "vitest";

import {
  authLogin,
  authLogout,
  authMe,
  configShow,
  contactStore,
} from "../api/generated/endpoints";
import { ApiError } from "../api/http";
import { setMockUser } from "./handlers";

/**
 * The `If-Match` a conditional write owes, read the way a screen reads it.
 *
 * Through the mocked GET rather than by calling mockEntityTag() here: a helper
 * computing the tag its own way would agree with itself and could pass against
 * a handler that hands out a different one.
 */
async function ifMatchFor(url: string): Promise<Record<string, string>> {
  const etag = (await fetch(url)).headers.get("ETag");
  return etag === null ? {} : { "If-Match": etag };
}

/**
 * The mocked backend is a layer the whole suite and the whole dev loop rest on,
 * so it gets its own tests. Going through the GENERATED client rather than
 * fetch() directly is the point: it exercises the same path the app takes,
 * including the mutator's envelope.
 *
 * During the R1a rebuild this only covers what the mocked API still has:
 * /api/v1/config, /api/v1/contact, and auth. The event/signup/altcha coverage that
 * used to live here modeled the domain Task 1 deleted.
 */

test("GET /config answers with the shape the boot gate reads", async () => {
  const result = await configShow();
  // Narrowed rather than asserted-then-read: the declared union now includes
  // the 503 every route behind RunPendingMigrations can answer with, so
  // `result.data` is not a config until `status` picks a branch.
  expect(result.status).toBe(200);
  if (result.status !== 200) {
    throw new Error("GET /config did not answer 200");
  }
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

// The whole reason /api/v1/contact is hand-written is its reject branch — both
// failure tests in Contact.test.tsx replace the handler outright, so nothing
// else exercised it.
test("POST /contact rejects a missing field the way the real API does", async () => {
  const error = (await contactStore({
    lastName: "Canard",
    firstName: "Donald",
    email: "donald@example.com",
    subject: "",
    message: "Coin",
    // The honeypot. Present and empty is what a person's browser sends; the
    // generated type now requires it, which is the point — a client that
    // omits it used to compile and then 422 on every submission.
    website: "",
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
  const response = await fetch("/api/v1/members");
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
  const roster = (await (await fetch("/api/v1/members")).json()) as { username: string }[];

  // 2026_09_08_000001 made credentials NOT NULL: people the band merely
  // displays are content, not members. A mock carrying a login-less row would
  // let a screen be built around a state the database cannot hold.
  expect(roster.every((member) => member.username.length > 0)).toBe(true);
});

test("refuses the roster to a member without members.manage", async () => {
  setMockUser("demo.player");
  const response = await fetch("/api/v1/members");

  // 403, not 401: they ARE logged in. The real routes get this split by pairing
  // auth:sanctum with permission:, and the SPA's guards depend on it.
  expect(response.status).toBe(403);
  expect(((await response.json()) as { code: string }).code).toBe("access_denied");
});

test("refuses the roster to an anonymous caller with 401, not 403", async () => {
  const response = await fetch("/api/v1/members");
  expect(response.status).toBe(401);
});

test("creating a member never mints them a role", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/members", {
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
  const before = ((await (await fetch("/api/v1/members")).json()) as unknown[]).length;

  // The assertion that makes every other test in the suite trustworthy: if
  // resetMockState() misses the roster, one test's member leaks into the next
  // and a count assertion fails only when the whole file runs.
  expect(before).toBe(5);
});

test("refuses to delete the last member who can administer members", async () => {
  setMockUser("demo.direction");
  // demo.both holds `direction` too, so remove them first — then Dominique is
  // the last holder and deleting anyone who holds it is refused.
  await fetch("/api/v1/members/3", {
    method: "DELETE",
    headers: await ifMatchFor("/api/v1/members/3"),
  });
  const response = await fetch("/api/v1/members/1", {
    method: "DELETE",
    headers: await ifMatchFor("/api/v1/members/1"),
  });

  // 409, not 403: the caller HAS the permission. The request conflicts with
  // the state of the system.
  expect(response.status).toBe(409);
  expect(((await response.json()) as { code: string }).code).toBe(
    "cannot_remove_last_administrator",
  );
});

test("refuses to delete yourself, once someone else can still administer", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/members/1", {
    method: "DELETE",
    headers: await ifMatchFor("/api/v1/members/1"),
  });

  expect(response.status).toBe(409);
  expect(((await response.json()) as { code: string }).code).toBe("cannot_delete_self");
});

test("refuses to remove your own administration", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/members/1/roles", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await ifMatchFor("/api/v1/members/1")) },
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
  const response = await fetch("/api/v1/members/2", {
    method: "DELETE",
    headers: await ifMatchFor("/api/v1/members/2"),
  });

  expect(response.status).toBe(200);
});

test("changing your own password does need the current one", async () => {
  setMockUser("demo.direction");
  const refused = await fetch("/api/v1/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "wrong", newPassword: "un-mot-de-passe-long" }),
  });

  expect(refused.status).toBe(403);
  expect(((await refused.json()) as { code: string }).code).toBe("reauth_failed");

  const accepted = await fetch("/api/v1/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "demo", newPassword: "un-mot-de-passe-long" }),
  });

  expect(accepted.status).toBe(200);
});

test("the register list is the one the migration seeds", async () => {
  setMockUser("demo.direction");
  const sections = (await (await fetch("/api/v1/sections")).json()) as { name: string }[];

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
  const roles = (await (await fetch("/api/v1/roles")).json()) as Record<string, unknown>[];

  // Decision B6: the UI resolves the French from `key`. A label here would let
  // a screen render a name the real API never sends.
  expect(roles.map((role) => role.key)).toEqual(["direction", "committee"]);
  expect(roles.every((role) => !("label" in role) && !("labelFr" in role))).toBe(true);
});

test("editing a member changes only what the real request validates", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/members/2", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await ifMatchFor("/api/v1/members/2")) },
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

// ---------------------------------------------------------------- the planning

test("lists the planning soonest first, and hides the past", async () => {
  setMockUser("demo.player");
  const response = await fetch("/api/v1/events");
  const planning = (await response.json()) as { title: string; startsAt: string }[];

  expect(response.status).toBe(200);
  expect(planning.length).toBeGreaterThan(0);

  const times = planning.map((event) => Date.parse(event.startsAt));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(Math.min(...times)).toBeGreaterThan(Date.now());
});

test("the past is the other half of the list, newest first", async () => {
  setMockUser("demo.player");
  const past = (await (await fetch("/api/v1/events?past=1")).json()) as { startsAt: string }[];

  const times = past.map((event) => Date.parse(event.startsAt));
  expect(times).toEqual([...times].sort((a, b) => b - a));
  expect(Math.max(...times)).toBeLessThan(Date.now());
});

test("reading the planning needs no permission", async () => {
  // Everybody in the band needs to know when the next rehearsal is.
  setMockUser("demo.player");
  expect((await fetch("/api/v1/events")).status).toBe(200);
});

test("refuses to create an event for somebody who does not organise", async () => {
  setMockUser("demo.player");
  const response = await fetch("/api/v1/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Non", location: "X" }),
  });

  expect(response.status).toBe(403);
  expect(((await response.json()) as { code: string }).code).toBe("access_denied");
});

test("tells an anonymous caller 401, not 403", async () => {
  // The split the real routes get by pairing auth:sanctum with permission:.
  // A 403 here would tell a stranger the endpoint exists and that they merely
  // lack a grant.
  setMockUser(null);
  expect((await fetch("/api/v1/events")).status).toBe(401);
  expect((await fetch("/api/v1/events", { method: "POST", body: "{}" })).status).toBe(401);
});

test("refuses an end before the start, against its own field", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "À l'envers",
      startsAt: "2026-09-05T12:00:00+02:00",
      endsAt: "2026-09-05T10:00:00+02:00",
      location: "Werkhof",
      attire: null,
      isPublic: false,
      notes: null,
    }),
  });

  expect(response.status).toBe(400);
  const body = (await response.json()) as { code: string; errors: { field: string }[] };
  expect(body.code).toBe("validation_failed");
  expect(body.errors[0]?.field).toBe("endsAt");
});

test("patching only the end still compares against the stored start", async () => {
  // The sharp case, and the one the real UpdateEventRequest exists for: the
  // request carries no startsAt, so a mock comparing input against input
  // would pass it vacuously.
  setMockUser("demo.direction");
  const planning = (await (await fetch("/api/v1/events")).json()) as { id: number }[];
  const target = planning[0];

  const response = await fetch(`/api/v1/events/${target?.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(await ifMatchFor(`/api/v1/events/${target?.id}`)),
    },
    body: JSON.stringify({ endsAt: new Date(Date.now() - 86_400_000).toISOString() }),
  });

  expect(response.status).toBe(400);
});

test("a series creates one independent event per date", async () => {
  setMockUser("demo.direction");
  const before = ((await (await fetch("/api/v1/events")).json()) as unknown[]).length;

  const response = await fetch("/api/v1/events/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      template: {
        title: "Répétition",
        location: "Werkhof",
        attire: "Libre",
        isPublic: false,
        notes: null,
        startTime: "10:00",
        endTime: "12:00",
      },
      dates: [40, 47, 54].map((offset) =>
        new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10),
      ),
    }),
  });

  expect(response.status).toBe(201);
  const created = (await response.json()) as { id: number }[];
  expect(created).toHaveLength(3);
  // Distinct ids: they are three events, not one repeated.
  expect(new Set(created.map((event) => event.id)).size).toBe(3);

  const after = ((await (await fetch("/api/v1/events")).json()) as unknown[]).length;
  expect(after).toBe(before + 3);
});

test("deleting an event takes it off the planning", async () => {
  setMockUser("demo.direction");
  const planning = (await (await fetch("/api/v1/events")).json()) as { id: number }[];
  const target = planning[0];

  const response = await fetch(`/api/v1/events/${target?.id}`, {
    method: "DELETE",
    headers: await ifMatchFor(`/api/v1/events/${target?.id}`),
  });
  expect(response.status).toBe(200);

  const after = (await (await fetch("/api/v1/events")).json()) as { id: number }[];
  expect(after.some((event) => event.id === target?.id)).toBe(false);
});

test("forgets a created event between tests", async () => {
  setMockUser("demo.direction");
  const before = ((await (await fetch("/api/v1/events")).json()) as unknown[]).length;

  // If resetMockState() misses the events store, an event created by an
  // earlier test leaks into this count and it fails only when the whole file
  // runs — which reads as flakiness and is not.
  // Five upcoming of the six seeded; the sixth is the past one.
  expect(before).toBe(5);
});
