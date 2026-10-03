import { expect, test } from "vitest";

import {
  authLogin,
  authLogout,
  authMe,
  configShow,
  contactStore,
} from "../api/generated/endpoints";
import { ApiError } from "../api/http";
import { publicWriteHeaders } from "../api/publicWrite";
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
 * The rows of a mocked collection.
 *
 * Every list endpoint answers `{data, meta}`, mock and server alike, so a test
 * reading `await response.json()` as an array gets the envelope and silently
 * measures nothing. This is the one hop, in one place.
 */
async function rowsOf<T>(url: string): Promise<T[]> {
  return ((await (await fetch(url)).json()) as { data: T[] }).data;
}

/**
 * The mocked backend is a layer the whole suite and the whole dev loop rest on,
 * so it gets its own tests. Going through the GENERATED client rather than
 * fetch() directly is the point: it exercises the same path the app takes,
 * including the mutator's envelope.
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
    sectionName: null,
    committeeFunctionName: null,
    roleKeys: ["direction", "member"],
    permissions: [
      "events.manage",
      "attendance.view_all",
      "attendance.record_for_others",
      "members.manage",
      "registrations.view",
      "registrations.manage",
      // Granted by 2026_09_15_000002, alongside the seeded set above.
      "messages.view",
      "messages.manage",
      "history.manage",
      "images.manage",
      "events.view",
      "account.manage",
    ],
  });
});

// The whole reason /api/v1/contact is hand-written is its reject branch — both
// failure tests in Contact.test.tsx replace the handler outright, so nothing
// else exercised it.
test("POST /contact rejects a missing field the way the real API does", async () => {
  const error = (await contactStore(
    {
      lastName: "Canard",
      firstName: "Donald",
      email: "donald@example.com",
      subject: "",
      message: "Coin",
      // The honeypot. Present and empty is what a person's browser sends; the
      // generated type now requires it, which is the point — a client that
      // omits it used to compile and then 422 on every submission.
      website: "",
      // THE GUARD RUNS BEFORE VALIDATION, so a bare POST never reaches the
      // missing-field branch this test is about — it is refused as automated
      // first. That ordering is not a detail of the mock: `npm run smoke`
      // asserted a 400 here for a week and was getting the 422.
    },
    publicWriteHeaders("mock-form-token", "handlers-test-idempotency-key"),
  ).catch((thrown: unknown) => thrown)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  // 400, not Laravel's default 422: every validation failure in this API goes
  // through ApiError::validation(), which ends `self::json(400, ...)`.
  expect(error.status).toBe(400);
  expect(error.code).toBe("validation_failed");
  expect(error.fields).toEqual([{ field: "subject", reason: "required" }]);
});

/**
 * The other half of that ordering, pinned so the mock cannot quietly start
 * validating first and let a screen ship having never sent a form token.
 */
test("POST /contact refuses a submission with no form token before it validates", async () => {
  const error = (await contactStore({
    lastName: "",
    firstName: "",
    email: "",
    subject: "",
    message: "",
    website: "",
  }).catch((thrown: unknown) => thrown)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(422);
  expect(error.code).toBe("spam_suspected");
  // Five empty required fields, and not one of them is named: a script must
  // not learn which check it tripped.
  expect(error.fields).toEqual([]);
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
  const roster = ((await response.json()) as { data: { lastName: string }[] }).data;

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
  const roster = await rowsOf<{ username: string }>("/api/v1/members");

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

test("creating a member mints only the baseline role, whatever the body asks for", async () => {
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
      roleIds: [1],
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
  // The baseline `member` role (id 3), never `direction` (1) as asked and never
  // `musician` (4) although a register was given.
  expect(created.member.roleIds).toEqual([3]);
  // Derived from sectionId in the real Resource, so they can never disagree.
  expect(created.member.sectionName).toBe("Cloches");
  expect(created.member.isPlayer).toBe(true);
  expect(created.member.mustChangePassword).toBe(true);
  expect(created.generatedPassword).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
});

test("forgets a created member between tests", async () => {
  setMockUser("demo.direction");
  const before = (await rowsOf<unknown>("/api/v1/members")).length;

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
  // ADR 0017: the cookie is trusted here, as it already is for reading the
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

/* -------------------------------------------------------------------------- *
 * Collections
 * -------------------------------------------------------------------------- */

test("every mocked collection carries the envelope the real API sends", async () => {
  // The mock earns its keep by RESHAPING the way the server does. A handler
  // still answering a bare array would let every screen typecheck against a
  // shape the API stopped sending, and the component tests would then agree
  // with the mock rather than with the contract.
  setMockUser("demo.direction");

  for (const url of ["/api/v1/members", "/api/v1/sections", "/api/v1/roles", "/api/v1/events"]) {
    const response = await fetch(url);
    const body = (await response.json()) as {
      data: unknown[];
      meta: { total: number; limit: number; offset: number };
    };

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(body.data.length);
    expect(body.meta.limit).toBe(500);
    expect(body.meta.offset).toBe(0);
    expect(response.headers.get("Link")).toContain('rel="first"');
  }
});

test("a mocked collection pages and counts the whole list, not the page", async () => {
  setMockUser("demo.direction");

  const body = (await (await fetch("/api/v1/members?limit=2")).json()) as {
    data: unknown[];
    meta: { total: number };
  };

  expect(body.data).toHaveLength(2);
  // The point of `total`: the screen can say "5 membres" having been sent two.
  expect(body.meta.total).toBe(5);
});

test("a mocked collection ignores a nonsense limit rather than emptying itself", async () => {
  // `(int) "abc"` is 0 in PHP and `Number("abc")` is NaN here; either read as a
  // limit answers every list with nothing. Mirrors App\Support\Page.
  setMockUser("demo.direction");

  const body = (await (await fetch("/api/v1/members?limit=abc")).json()) as { data: unknown[] };

  expect(body.data).toHaveLength(5);
});

test("the register list is the one the migration seeds", async () => {
  setMockUser("demo.direction");
  const sections = await rowsOf<{ name: string }>("/api/v1/sections");

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
  const roles = await rowsOf<Record<string, unknown>>("/api/v1/roles");

  // ADR 0014: the UI resolves the French from `key`. A label here would let
  // a screen render a name the real API never sends.
  expect(roles.map((role) => role.key)).toEqual(["direction", "committee", "member", "musician"]);
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
  // The write did not touch roleIds: what remains is Perrine's seeded roles,
  // member (3) and musician (4), not the [1] the body tried to set.
  expect(member.roleIds).toEqual([3, 4]);
});

// ---------------------------------------------------------------- the planning

test("lists the planning soonest first, and hides the past", async () => {
  setMockUser("demo.player");
  const response = await fetch("/api/v1/events");
  const planning = ((await response.json()) as { data: { title: string; startsAt: string }[] })
    .data;

  expect(response.status).toBe(200);
  expect(planning.length).toBeGreaterThan(0);

  const times = planning.map((event) => Date.parse(event.startsAt));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(Math.min(...times)).toBeGreaterThan(Date.now());
});

test("the past is the other half of the list, newest first", async () => {
  setMockUser("demo.player");
  const past = await rowsOf<{ startsAt: string }>("/api/v1/events?past=1");

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
  // A PUBLISHED, dated event: the list now opens with the drafts, and an
  // undated one has no stored start to compare against.
  const planning = await rowsOf<{ id: number; publishedAt: string | null }>("/api/v1/events");
  const target = planning.find((event) => event.publishedAt !== null);

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
  const before = (await rowsOf<unknown>("/api/v1/events")).length;

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
  // Through `data`: the generator answers with a collection, and a 201 is a
  // collection just as much as a 200 is.
  const body = (await response.json()) as { data: { id: number }[]; meta: { total: number } };
  const created = body.data;
  expect(created).toHaveLength(3);
  expect(body.meta.total).toBe(3);
  // Distinct ids: they are three events, not one repeated.
  expect(new Set(created.map((event) => event.id)).size).toBe(3);

  const after = (await rowsOf<unknown>("/api/v1/events")).length;
  expect(after).toBe(before + 3);
});

test("deleting an event takes it off the planning", async () => {
  setMockUser("demo.direction");
  const planning = await rowsOf<{ id: number }>("/api/v1/events");
  const target = planning[0];

  const response = await fetch(`/api/v1/events/${target?.id}`, {
    method: "DELETE",
    headers: await ifMatchFor(`/api/v1/events/${target?.id}`),
  });
  expect(response.status).toBe(200);

  const after = await rowsOf<{ id: number }>("/api/v1/events");
  expect(after.some((event) => event.id === target?.id)).toBe(false);
});

test("forgets a created event between tests", async () => {
  setMockUser("demo.direction");
  const before = (await rowsOf<unknown>("/api/v1/events")).length;

  // If resetMockState() misses the events store, an event created by an
  // earlier test leaks into this count and it fails only when the whole file
  // runs — which reads as flakiness and is not.
  // Six upcoming of the seven published; the seventh is the past one. A
  // manager's list also carries the two seeded drafts.
  expect(before).toBe(8);
});

// ------------------------------------------------------------------- drafts

type Row = { id: number; publishedAt: string | null; startsAt: string | null };

const JSON_HEADERS = { "Content-Type": "application/json" };

test("a manager sees drafts first in the default list, the undated one before the dated one", async () => {
  setMockUser("demo.direction");
  const rows = await rowsOf<Row>("/api/v1/events");
  const drafts = rows.filter((row) => row.publishedAt === null);

  expect(drafts.map((row) => row.id)).toEqual([9, 8]);
  expect(rows[0]?.startsAt).toBeNull();
});

test("a draft is never in the history", async () => {
  setMockUser("demo.direction");
  const past = await rowsOf<Row>("/api/v1/events?past=1");

  expect(past.some((row) => row.publishedAt === null)).toBe(false);
});

test("a player sees no draft in either half", async () => {
  setMockUser("demo.player");
  const rows = [
    ...(await rowsOf<Row>("/api/v1/events")),
    ...(await rowsOf<Row>("/api/v1/events?past=1")),
  ];

  expect(rows.length).toBeGreaterThan(0);
  expect(rows.some((row) => row.publishedAt === null)).toBe(false);
});

test("a draft is a 404 by id for a player and readable by a manager", async () => {
  setMockUser("demo.player");
  expect((await fetch("/api/v1/events/9")).status).toBe(404);

  setMockUser("demo.direction");
  expect((await fetch("/api/v1/events/9")).status).toBe(200);
});

test("creating an event makes a draft that only a manager can see", async () => {
  setMockUser("demo.direction");
  const created = await fetch("/api/v1/events", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ title: "Lieu à confirmer" }),
  });

  expect(created.status).toBe(201);
  const event = (await created.json()) as Row;
  expect(event.publishedAt).toBeNull();
  expect(event.startsAt).toBeNull();

  setMockUser("demo.player");
  expect((await rowsOf<Row>("/api/v1/events")).some((row) => row.id === event.id)).toBe(false);
});

test("a published event cannot lose its date, a draft can", async () => {
  setMockUser("demo.direction");
  const published = (await rowsOf<Row>("/api/v1/events")).find((row) => row.publishedAt !== null);

  const refused = await fetch(`/api/v1/events/${published?.id}`, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, ...(await ifMatchFor(`/api/v1/events/${published?.id}`)) },
    body: JSON.stringify({ startsAt: null }),
  });
  expect(refused.status).toBe(400);
  const body = (await refused.json()) as { errors: { field: string; reason: string }[] };
  expect(body.errors[0]).toMatchObject({ field: "startsAt", reason: "required" });

  const allowed = await fetch("/api/v1/events/8", {
    method: "PATCH",
    headers: { ...JSON_HEADERS, ...(await ifMatchFor("/api/v1/events/8")) },
    body: JSON.stringify({ startsAt: null, endsAt: null, location: null }),
  });
  expect(allowed.status).toBe(200);
});

test("publishing an incomplete draft names every missing field", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/events/9/publish", {
    method: "POST",
    headers: await ifMatchFor("/api/v1/events/9"),
  });

  expect(response.status).toBe(422);
  const body = (await response.json()) as { code: string; errors: { field: string }[] };
  expect(body.code).toBe("event_incomplete");
  expect(body.errors.map((error) => error.field).sort()).toEqual([
    "endsAt",
    "location",
    "startsAt",
  ]);
});

test("publishing a complete draft puts it on everybody's planning", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/events/8/publish", {
    method: "POST",
    headers: await ifMatchFor("/api/v1/events/8"),
  });
  expect(response.status).toBe(200);
  expect(((await response.json()) as Row).publishedAt).not.toBeNull();

  setMockUser("demo.player");
  expect((await rowsOf<Row>("/api/v1/events")).some((row) => row.id === 8)).toBe(true);
});

test("publishing needs the current tag", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/events/8/publish", { method: "POST" });

  expect(response.status).toBe(428);
});

test("an event nobody has answered goes back to draft, one with answers does not", async () => {
  setMockUser("demo.direction");

  const refused = await fetch("/api/v1/events/1/publish", {
    method: "DELETE",
    headers: await ifMatchFor("/api/v1/events/1"),
  });
  expect(refused.status).toBe(409);
  expect(((await refused.json()) as { code: string }).code).toBe("event_has_answers");

  const allowed = await fetch("/api/v1/events/2/publish", {
    method: "DELETE",
    headers: await ifMatchFor("/api/v1/events/2"),
  });
  expect(allowed.status).toBe(200);
  expect(((await allowed.json()) as Row).publishedAt).toBeNull();
});

test("a draft takes no answers: 404 for a player, 409 for a manager", async () => {
  setMockUser("demo.player");
  const asPlayer = await fetch("/api/v1/events/8/attendance", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ status: "yes" }),
  });
  expect(asPlayer.status).toBe(404);

  setMockUser("demo.both");
  const asManager = await fetch("/api/v1/events/8/attendance", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ status: "yes" }),
  });
  expect(asManager.status).toBe(409);
  expect(((await asManager.json()) as { code: string }).code).toBe("event_not_published");
});

test("the public agenda leaves out a public draft", async () => {
  setMockUser(null);
  const agenda = await rowsOf<{ id: number }>("/api/v1/agenda");

  // Draft 8 is seeded public precisely so that this can fail.
  expect(agenda.some((row) => row.id === 8)).toBe(false);
});

test("a draft's booking form is a 404 for everyone, a manager included", async () => {
  setMockUser("demo.direction");
  await fetch("/api/v1/events/8", {
    method: "PATCH",
    headers: { ...JSON_HEADERS, ...(await ifMatchFor("/api/v1/events/8")) },
    body: JSON.stringify({ registrationClosesAt: "2099-01-01T00:00:00+00:00" }),
  });

  expect((await fetch("/api/v1/events/8/registration")).status).toBe(404);
});

test("a generated season is created as drafts", async () => {
  setMockUser("demo.direction");
  const response = await fetch("/api/v1/events/series", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      template: {
        title: "Répétition",
        location: "Werkhof",
        attire: null,
        isPublic: false,
        notes: null,
        startTime: "20:00",
        endTime: "22:00",
      },
      dates: ["2099-01-12", "2099-01-19"],
    }),
  });

  expect(response.status).toBe(201);
  const created = ((await response.json()) as { data: Row[] }).data;
  expect(created).toHaveLength(2);
  expect(created.every((row) => row.publishedAt === null)).toBe(true);
});

/* ------------------------------------------------------------------------ *
 * The image library (#105)
 */

/** The smallest byte string the mock accepts as a JPEG: SOI, one SOF0 carrying the size, EOI. */
function jpegFile(width: number, height: number, salt: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    salt,
    0xff,
    0xd9,
  ]);
}

/**
 * POSTs the sizes of one photo as multipart, one `files[]` part each, with the
 * body written out by hand.
 *
 * Not `new FormData()`: jsdom's FormData and File are not the ones Node's
 * fetch serialises, so the file part goes out empty and the mock rightly
 * answers `image_not_jpeg`.
 */
function multipart(
  url: string,
  parts: Uint8Array[],
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response> {
  const boundary = "----mockboundary";
  const encoder = new TextEncoder();
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const bytes: number[] = [];
  for (const part of parts) {
    bytes.push(...encoder.encode(head), ...part, ...encoder.encode("\r\n"));
  }
  for (const [name, value] of Object.entries(fields)) {
    bytes.push(
      ...encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  bytes.push(...encoder.encode(`--${boundary}--\r\n`));
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, ...headers },
    body: new Uint8Array(bytes),
  });
}

function upload(...parts: Uint8Array[]): Promise<Response> {
  return multipart("/api/v1/images", parts, { name: "Photo de test" });
}

type ImageRow = {
  id: number;
  url: string;
  width: number;
  height: number;
  srcset: string;
  bytes: number;
  sizes: { width: number; url: string }[];
  usages: unknown[];
};

async function refusal(response: Response): Promise<{ field: string; reason: string }[]> {
  expect(response.status).toBe(400);
  const body = (await response.json()) as {
    code: string;
    errors: { field: string; reason: string }[];
  };
  expect(body.code).toBe("validation_failed");
  return body.errors;
}

test("an upload answers 201, and the same photo again answers 200 with the same image", async () => {
  setMockUser("demo.direction");

  const first = await upload(jpegFile(800, 600, 1));
  expect(first.status).toBe(201);
  const created = (await first.json()) as ImageRow;
  expect(created).toMatchObject({ width: 800, height: 600, usages: [] });
  expect(created.url).toMatch(/^\/api\/v1\/images\/[0-9a-f]{64}\.jpg$/);

  const again = await upload(jpegFile(800, 600, 1));
  expect(again.status).toBe(200);
  expect(((await again.json()) as ImageRow).id).toBe(created.id);

  const other = await upload(jpegFile(800, 600, 2));
  expect(other.status).toBe(201);
});

test("an upload stores its trimmed name, and refuses a blank or long one as the API does", async () => {
  setMockUser("demo.direction");

  const named = await multipart("/api/v1/images", [jpegFile(800, 600, 40)], {
    name: "  Carnaval 2026  ",
  });
  expect(named.status).toBe(201);
  expect(((await named.json()) as { name: string }).name).toBe("Carnaval 2026");

  for (const [fields, reason] of [
    [{}, "required"],
    [{ name: "   " }, "required"],
    [{ name: "é".repeat(121) }, "too_long"],
    [{ name: `a${String.fromCodePoint(7)}b` }, "invalid_format"],
    [{ name: `photo${String.fromCodePoint(0x202e)}gpj.exe` }, "invalid_format"],
  ] as const) {
    const refused = await multipart("/api/v1/images", [jpegFile(800, 600, 41)], fields);
    expect(await refusal(refused)).toEqual([{ field: "name", reason }]);
  }
});

test("every size sent is stored, listed smallest first and served, and the largest is the photo", async () => {
  setMockUser("demo.direction");

  const response = await upload(
    jpegFile(480, 320, 3),
    jpegFile(1920, 1280, 3),
    jpegFile(960, 640, 3),
  );
  expect(response.status).toBe(201);
  const created = (await response.json()) as ImageRow;

  expect(created).toMatchObject({ width: 1920, height: 1280 });
  expect(created.sizes.map((size) => size.width)).toEqual([480, 960, 1920]);
  expect(created.srcset).toBe(created.sizes.map((size) => `${size.url} ${size.width}w`).join(", "));
  for (const size of created.sizes) {
    expect((await fetch(size.url)).status).toBe(200);
  }
  // Each size is served at the digest of its own bytes, so no two share a URL.
  expect(new Set(created.sizes.map((size) => size.url)).size).toBe(3);
  for (const size of created.sizes) {
    const served = await fetch(size.url);
    expect(served.headers.get("ETag")).toBe(`"${/([0-9a-f]{64})\.jpg$/.exec(size.url)?.[1]}"`);
  }
  expect((await fetch(`/api/v1/images/${"f".repeat(64)}.jpg`)).status).toBe(404);
});

test("a part that is not a JPEG is refused against its own index", async () => {
  setMockUser("demo.direction");
  const errors = await refusal(
    await upload(jpegFile(960, 640, 4), new TextEncoder().encode("not a picture")),
  );
  expect(errors).toEqual([{ field: "files.1", reason: "image_not_jpeg" }]);
});

test("the set is checked as StoreImageRequest checks it", async () => {
  setMockUser("demo.direction");

  expect(await refusal(await upload())).toEqual([{ field: "files", reason: "required" }]);
  expect(
    await refusal(
      await upload(
        jpegFile(1920, 1280, 5),
        jpegFile(960, 640, 5),
        jpegFile(480, 320, 5),
        jpegFile(240, 160, 5),
      ),
    ),
  ).toEqual([{ field: "files", reason: "image_set_too_many" }]);
  expect(await refusal(await upload(jpegFile(960, 640, 6), jpegFile(960, 640, 7)))).toEqual([
    { field: "files", reason: "image_set_widths_repeated" },
  ]);
  expect(await refusal(await upload(jpegFile(1920, 1280, 8), jpegFile(480, 360, 8)))).toEqual([
    { field: "files", reason: "image_set_aspect_mismatch" },
  ]);
});

test("the library holds 100 images: a new file answers 409, a known one still 200", async () => {
  setMockUser("demo.direction");
  const summary = (await (await fetch("/api/v1/images/summary")).json()) as { count: number };
  for (let salt = 0; salt < 100 - summary.count; salt++) {
    expect((await upload(jpegFile(10, 10, salt))).status).toBe(201);
  }

  const full = await upload(jpegFile(10, 10, 200));
  expect(full.status).toBe(409);
  expect(((await full.json()) as { code: string }).code).toBe("image_library_full");

  expect((await upload(jpegFile(10, 10, 0))).status).toBe(200);
  expect(await (await fetch("/api/v1/images/summary")).json()).toMatchObject({
    count: 100,
    capacity: 100,
  });
});

test("the library is for images.manage", async () => {
  setMockUser("demo.player");
  expect((await fetch("/api/v1/images")).status).toBe(403);
  expect((await upload(jpegFile(10, 10, 1))).status).toBe(403);
  const place = { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ imageId: null }) };
  expect((await fetch("/api/v1/site-photos/band", place)).status).toBe(403);
  expect((await fetch("/api/v1/sections/4/photo", place)).status).toBe(403);

  setMockUser(null);
  expect((await fetch("/api/v1/images")).status).toBe(401);
});

test("an image that is placed cannot be deleted, and one that is free can", async () => {
  setMockUser("demo.direction");
  const placed = (await rowsOf<ImageRow>("/api/v1/images")).find((row) => row.usages.length > 0);
  expect(placed).toBeDefined();

  const refused = await fetch(`/api/v1/images/${placed?.id}`, {
    method: "DELETE",
    headers: await ifMatchFor(`/api/v1/images/${placed?.id}`),
  });
  expect(refused.status).toBe(409);
  expect(((await refused.json()) as { code: string }).code).toBe("image_in_use");

  const free = (await (await upload(jpegFile(40, 30, 9))).json()) as ImageRow;
  expect((await fetch(`/api/v1/images/${free.id}`, { method: "DELETE" })).status).toBe(428);
  const deleted = await fetch(`/api/v1/images/${free.id}`, {
    method: "DELETE",
    headers: await ifMatchFor(`/api/v1/images/${free.id}`),
  });
  expect(deleted.status).toBe(200);
  expect((await fetch(`/api/v1/images/${free.id}`)).status).toBe(404);
  // Its sizes went with it.
  expect((await fetch(free.url)).status).toBe(404);
});

test("a rename trims the name under the current tag, and answers the new one", async () => {
  setMockUser("demo.direction");
  const url = "/api/v1/images/1";
  const body = JSON.stringify({ name: "  Le groupe, 2026  " });

  expect((await fetch(url, { method: "PATCH", headers: JSON_HEADERS, body })).status).toBe(428);
  const stale = await fetch(url, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, "If-Match": '"00000000"' },
    body,
  });
  expect(stale.status).toBe(412);

  const blank = await fetch(url, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, ...(await ifMatchFor(url)) },
    body: JSON.stringify({ name: "  " }),
  });
  expect(await refusal(blank)).toEqual([{ field: "name", reason: "required" }]);

  const renamed = await fetch(url, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, ...(await ifMatchFor(url)) },
    body,
  });
  expect(renamed.status).toBe(200);
  expect(((await renamed.json()) as { name: string }).name).toBe("Le groupe, 2026");
  expect(renamed.headers.get("ETag")).toBe((await ifMatchFor(url))["If-Match"]);
});

test("a replace swaps the sizes under the same id and refuses another image's photo", async () => {
  setMockUser("demo.direction");
  const replace = async (id: number, ...parts: Uint8Array[]) =>
    multipart(`/api/v1/images/${id}/file`, parts, {}, await ifMatchFor(`/api/v1/images/${id}`));

  const before = (await (await fetch("/api/v1/images/1")).json()) as ImageRow;
  expect((await multipart("/api/v1/images/1/file", [jpegFile(600, 900, 50)], {})).status).toBe(428);
  expect(await refusal(await replace(1, new Uint8Array([1, 2, 3])))).toEqual([
    { field: "files.0", reason: "image_not_jpeg" },
  ]);

  const swapped = await replace(1, jpegFile(600, 900, 50), jpegFile(300, 450, 50));
  expect(swapped.status).toBe(200);
  const after = (await swapped.json()) as ImageRow;
  expect(after).toMatchObject({ id: 1, width: 600, height: 900 });
  expect(after.url).not.toBe(before.url);
  // Still the band photo: the placement names the id.
  expect(after.usages).toEqual(before.usages);
  // The stored bytes are served, so a rotation has a JPEG to decode.
  const served = await fetch(after.url);
  expect(served.headers.get("Content-Type")).toBe("image/jpeg");

  const same = await replace(1, jpegFile(600, 900, 50), jpegFile(300, 450, 50));
  expect(same.status).toBe(200);
  expect(((await same.json()) as ImageRow).url).toBe(after.url);

  const other = (await (await upload(jpegFile(500, 500, 51))).json()) as ImageRow;
  const duplicate = await replace(1, jpegFile(500, 500, 51));
  expect(duplicate.status).toBe(409);
  expect(((await duplicate.json()) as { code: string }).code).toBe("image_already_in_library");
  expect(other.id).not.toBe(1);
});

/** PUT one place's photo, as PhotoPlacementController takes it: no If-Match. */
const placePhoto = (url: string, body: unknown) =>
  fetch(url, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(body) });

test("placing a photo writes one place, with no tag, and shows on the public pages", async () => {
  setMockUser("demo.direction");
  const site = (await (await fetch("/api/v1/site-photos")).json()) as {
    band: { url: string } | null;
  };
  expect(site.band).not.toBeNull();

  const concert = await placePhoto("/api/v1/site-photos/concert", { imageId: 1 });
  expect(concert.status).toBe(200);
  expect(((await concert.json()) as { photo: { url: string } }).photo.url).toBe(site.band?.url);
  expect((await placePhoto("/api/v1/sections/5/photo", { imageId: null })).status).toBe(200);

  setMockUser(null);
  const photos = (await (await fetch("/api/v1/site-photos")).json()) as {
    band: { url: string } | null;
    concert: { url: string } | null;
  };
  // The band photo was not sent and is unchanged.
  expect(photos.band?.url).toBe(site.band?.url);
  expect(photos.concert?.url).toMatch(/^\/api\/v1\/images\/[0-9a-f]{64}\.jpg$/);
  // No placement carries alt text; the page describes the photo.
  expect(photos.concert).not.toHaveProperty("altFr");
  const band = await rowsOf<{ photo: unknown }>("/api/v1/band");
  expect(band.every((section) => section.photo === null)).toBe(true);
});

test("a placement refuses a missing or unknown image id, and an unknown place", async () => {
  setMockUser("demo.direction");
  expect(await refusal(await placePhoto("/api/v1/sections/4/photo", {}))).toEqual([
    { field: "imageId", reason: "required" },
  ]);
  expect(await refusal(await placePhoto("/api/v1/sections/4/photo", { imageId: 999 }))).toEqual([
    { field: "imageId", reason: "invalid_format" },
  ]);
  expect((await placePhoto("/api/v1/site-photos/poster", { imageId: 1 })).status).toBe(404);
  expect((await placePhoto("/api/v1/sections/999/photo", { imageId: 1 })).status).toBe(404);
});

test("the band page carries the seeded register photo, and an empty register carries none", async () => {
  setMockUser(null);
  const band = await rowsOf<{ photo: { url: string } | null }>("/api/v1/band");

  const withPhoto = band.filter((section) => section.photo !== null);
  expect(withPhoto).toHaveLength(1);
  expect(withPhoto[0]?.photo?.url).toMatch(/^\/api\/v1\/images\/[0-9a-f]{64}\.jpg$/);
  expect(band.some((section) => section.photo === null)).toBe(true);

  const site = (await (await fetch("/api/v1/site-photos")).json()) as {
    band: unknown;
    concert: unknown;
  };
  expect(site.band).not.toBeNull();
  expect(site.concert).toBeNull();
});

test("the history carries the seeded photo", async () => {
  setMockUser(null);
  const history = await rowsOf<{ photo: unknown }>("/api/v1/history");
  expect(history.filter((row) => row.photo !== null)).toHaveLength(1);
});

test("an image file is served as a labelled placeholder of its own size", async () => {
  setMockUser("demo.direction");
  const first = (await rowsOf<ImageRow>("/api/v1/images"))[0] as ImageRow;
  setMockUser(null);

  const response = await fetch(first.url);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
  const svg = await response.text();
  expect(svg).toContain(`width="${first.width}"`);
  expect(svg).toContain(`height="${first.height}"`);
  expect(svg).toContain(`Photo ${first.id}`);

  expect((await fetch(`/api/v1/images/${"f".repeat(64)}.jpg`)).status).toBe(404);

  // A smaller size is served at its own dimensions.
  const smallest = first.sizes[0] as ImageRow["sizes"][number];
  expect(smallest.width).toBeLessThan(first.width);
  expect(await (await fetch(smallest.url)).text()).toContain(`width="${smallest.width}"`);
});

test("a history entry's photo has its own write, which the entry's PUT never touches", async () => {
  setMockUser("demo.direction");
  const entry = (await rowsOf<{ id: number; imageId: number | null }>("/api/v1/history")).find(
    (row) => row.imageId !== null,
  );
  const url = `/api/v1/history/${entry?.id}`;
  const text = {
    occurredOn: "2026-01-01",
    precision: "year",
    important: false,
    titleFr: "Le flambeau passe",
  };

  // An imageId in the entry's own body is ignored.
  const edited = await fetch(url, {
    method: "PUT",
    headers: { ...JSON_HEADERS, ...(await ifMatchFor(url)) },
    body: JSON.stringify({ ...text, imageId: null }),
  });
  expect(((await edited.json()) as { imageId: number | null }).imageId).toBe(entry?.imageId);

  const cleared = await placePhoto(`${url}/photo`, { imageId: null });
  expect(await cleared.json()).toEqual({ photo: null });
  expect(((await (await fetch(url)).json()) as { imageId: number | null }).imageId).toBeNull();

  // Both permissions: images.manage alone is not enough to change an entry.
  setMockUser("demo.player");
  expect((await placePhoto(`${url}/photo`, { imageId: 1 })).status).toBe(403);
});
