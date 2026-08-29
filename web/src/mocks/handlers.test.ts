import { expect, test } from "vitest";

import { solveChallenge } from "../api/altcha";
import {
  altcha,
  authUser,
  config,
  contact,
  eventIndex,
  eventStore,
  signupIndex,
  signupStore,
} from "../api/generated/endpoints";
import type {
  Altcha200,
  AuthenticationExceptionResponse,
  SignupIndex200One,
  SignupStoreBody,
} from "../api/generated/model";
import { ApiError } from "../api/http";
import { setMockUser } from "./handlers";

/**
 * The mocked backend is a layer the whole suite and the whole dev loop rest on,
 * so it gets its own tests. Going through the GENERATED client rather than
 * fetch() directly is the point: it exercises the same path the app takes,
 * including the mutator's envelope.
 */

test("GET /config answers with the shape the boot gate reads", async () => {
  const result = await config();
  expect(result.status).toBe(200);
  expect(result.data.env).toBe("dev");
  expect(result.data.features).toEqual({ souper_signup: true });
});

test("GET /user is 401 for an anonymous caller, which is a normal answer", async () => {
  const error = (await authUser().catch((thrown: unknown) => thrown)) as ApiError;
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(401);
  expect(error.code).toBe("not_authenticated");
});

test("GET /user reports whoever setMockUser logged in", async () => {
  setMockUser("demo.admin");
  const result = await authUser();
  expect(result.data).toEqual({ username: "demo.admin", role: "admin" });
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

test("GET /events returns the seeded French events, ordered by date", async () => {
  const result = await eventIndex();
  expect(result.data.map((event) => event.title)).toEqual([
    "Concert d'automne",
    "Assemblée générale",
    "Week-end de répétition",
  ]);
});

test("creating an event as an admin appends it", async () => {
  setMockUser("demo.admin");
  await eventStore({
    date: "2026-12-05",
    title: "Cortège",
    startTime: "14:00",
    endTime: "17:00",
    location: "Vieille-Ville",
    attire: null,
    weekend: false,
  });

  const result = await eventIndex();
  expect(result.data).toHaveLength(4);
});

// The mocks mirror the API's AUTHORISATION, not only its shapes. Without this
// the guards would look right in the mocked app and fail against the real one.
test("a non-admin creating an event is refused, as the real API refuses it", async () => {
  setMockUser("demo.user");
  const error = (await eventStore({
    date: "2026-12-05",
    title: "Cortège",
    startTime: "14:00",
    endTime: "17:00",
    location: "Vieille-Ville",
    attire: null,
    weekend: false,
  }).catch((thrown: unknown) => thrown)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(403);
  expect(error.code).toBe("access_denied");
});

test("an anonymous caller creating an event gets 401, not 403", async () => {
  const error = (await eventStore({
    date: "2026-12-05",
    title: "Cortège",
    startTime: "14:00",
    endTime: "17:00",
    location: "Vieille-Ville",
    attire: null,
    weekend: false,
  }).catch((thrown: unknown) => thrown)) as ApiError;

  expect(error.status).toBe(401);
});

// Proves afterEach's resetMockState() actually works: this runs after the
// create test above, and would see four events if state leaked between tests.
// The signup store is checked here for the same reason, and because it is the
// half a reset is easiest to forget: it is written by a PUBLIC endpoint, so a
// leak does not need a logged-in test to happen.
test("mock state is reset between tests", async () => {
  const result = await eventIndex();
  expect(result.data).toHaveLength(3);

  setMockUser("demo.admin");
  expect(asSummary((await signupIndex()).data).totalPersons).toBe(6);
});

/**
 * Narrow signupIndex()'s union to the JSON summary.
 *
 * That endpoint answers the summary, the xlsx export or a 401 body, so a bare
 * `as` cast would silently succeed on the wrong two and fail later on a missing
 * property. This fails where the mistake is, and narrows without a cast. The
 * shape itself is NOT re-declared — SignupIndex200One is generated from
 * api/openapi.json, and a local copy could only drift from it.
 */
function asSummary(
  data: SignupIndex200One | AuthenticationExceptionResponse | string,
): SignupIndex200One {
  if (typeof data === "string" || !("totalPersons" in data)) {
    throw new Error(`expected the JSON summary, got ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * A payload that passes every rule, so each test can spoil exactly one.
 *
 * `altcha` is filled in per call by solvedSignup(): the mock now verifies the
 * solution rather than accepting any truthy string, so a hardcoded one would
 * be a fixture that has to be kept in step with the challenge.
 */
const VALID_SIGNUP: Omit<SignupStoreBody, "altcha"> = {
  first_name: "Ada",
  last_name: "Lovelace",
  address: "Rue du Test 1, 1700 Fribourg",
  phone: "+41 79 000 00 01",
  email: "ada@example.com",
  table_name: "Famille Lovelace",
  menus: ["meat"],
};

/** The valid payload with a genuinely solved challenge, plus any spoiling. */
async function solvedSignup(overrides: Record<string, unknown> = {}) {
  const challenge = await altcha();
  return {
    ...VALID_SIGNUP,
    altcha: await solveChallenge(challenge.data as Altcha200),
    ...overrides,
  } as SignupStoreBody;
}

const rejection = (thrown: unknown) => thrown as ApiError;

test("the souper feature is on, with its occasion copy", async () => {
  const result = await config();

  expect(result.data.features).toEqual({ souper_signup: true });
  expect(result.data.occasion?.title).toBe("Souper des 25 ans des Canetons");
  expect(result.data.occasion?.maxGuests).toBe(30);
  expect(result.data.occasion?.menus.map((menu) => menu.value)).toEqual([
    "meat",
    "child",
    "vegetarian",
  ]);
});

// The solver is the real one, so a stub challenge would make the mocked form
// permanently unsubmittable — and the failure would look like a bug in the page.
test("the mocked challenge is really solvable", async () => {
  const challenge = await altcha();

  const payload = JSON.parse(atob(await solveChallenge(challenge.data as Altcha200)));

  // `number` is the assertion that matters: `salt` passes through the solver
  // untouched, so it would still match if nothing had been solved at all.
  expect(payload.number).toBe(3);
  expect(payload.salt).toBe((challenge.data as Altcha200).salt);
});

test("the mocked summary groups by table", async () => {
  setMockUser("demo.admin");
  const result = await signupIndex();

  expect(result.status).toBe(200);
  const summary = asSummary(result.data);
  expect(summary.totalPersons).toBe(6);
  expect(summary.totalTables).toBe(3);
  expect(summary.menuTotals).toEqual({ meat: 3, child: 1, vegetarian: 2 });
});

// The real SignupController::index() orders `table_name, id` BEFORE
// SignupStats::compute() groups first-seen, so the API's tables come out
// alphabetical. The mock must agree: a mock that returns a different order
// than the endpoint it stands in for lets a green suite certify a lie.
test("the mocked summary orders tables as the real endpoint does", async () => {
  setMockUser("demo.admin");
  const result = await signupIndex();

  const summary = asSummary(result.data);
  expect(summary.tables.map((table) => table.name)).toEqual([
    "Amis du kiosque",
    "Famille Lovelace",
    "Table du comité",
  ]);
});

/**
 * POST /api/signups had no test at all, so the whole validation ladder — the
 * part of this mock most likely to disagree with the API — was unverified.
 * These four pin the properties SignupStoreTest pins on the real endpoint.
 */

test("a filled honeypot is a plain 201 that stores nothing, checked before validation", async () => {
  // Nothing here would survive validation and there is no altcha at all, so a
  // 201 can only mean the honeypot was checked first — the same reasoning as
  // SignupStoreTest::test_a_filled_honeypot_precedes_validation.
  const result = await signupStore({ hp: "x", menus: ["nope"] } as unknown as SignupStoreBody);
  expect(result.status).toBe(201);

  setMockUser("demo.admin");
  expect(asSummary((await signupIndex()).data).totalPersons).toBe(6);
});

test("an empty submission is a 400 naming every field in rules() order", async () => {
  const error = rejection(
    await signupStore({} as unknown as SignupStoreBody).catch((thrown: unknown) => thrown),
  );

  expect(error).toBeInstanceOf(ApiError);
  // 400, not 422 — ApiError::validation()'s status for every failure.
  expect(error.status).toBe(400);
  expect(error.code).toBe("validation_failed");
  // The exact list SignupStoreTest asserts, `menus` last because the real API
  // adds it from an after() hook rather than from a rule.
  expect(error.fields?.map((field) => field.field)).toEqual([
    "first_name",
    "last_name",
    "address",
    "phone",
    "email",
    "table_name",
    "menus",
  ]);
});

// The regression the two-pass loop had: it emitted every `required` first and
// every `too_long` afterwards, so a form with one of each reported them in the
// opposite order to the API, which reports one entry per field in rules() order.
test("fields[] mixes required and too_long in field order, not by reason", async () => {
  const error = rejection(
    await signupStore(
      await solvedSignup({ first_name: "a".repeat(300), last_name: "", phone: "0".repeat(65) }),
    ).catch((thrown: unknown) => thrown),
  );

  expect(error.status).toBe(400);
  expect(error.fields).toEqual([
    { field: "first_name", reason: "too_long", params: { max: 255 } },
    { field: "last_name", reason: "required" },
    { field: "phone", reason: "too_long", params: { max: 64 } },
  ]);
});

// Both are reachable by using the form, not only from a hand-crafted request:
// a typo'd address, and a menu select left at a value the occasion dropped.
test("a malformed email and an unknown menu value are both invalid_format", async () => {
  const bad = rejection(
    await signupStore(await solvedSignup({ email: "nope" })).catch((thrown: unknown) => thrown),
  );
  expect(bad.status).toBe(400);
  expect(bad.fields).toEqual([{ field: "email", reason: "invalid_format" }]);

  const caviar = rejection(
    await signupStore(await solvedSignup({ menus: ["caviar"] })).catch((thrown: unknown) => thrown),
  );
  expect(caviar.status).toBe(400);
  expect(caviar.fields).toEqual([{ field: "menus", reason: "invalid_format" }]);
});

// An over-long address reports too_long, NOT invalid_format: SignupRequest puts
// `max:255` before `email`, and only the first failed rule per field is reported.
test("an over-long email reports the max rule, the way rules() orders them", async () => {
  const error = rejection(
    await signupStore(await solvedSignup({ email: `${"a".repeat(250)}@example.com` })).catch(
      (thrown: unknown) => thrown,
    ),
  );

  expect(error.fields).toEqual([{ field: "email", reason: "too_long", params: { max: 255 } }]);
});

test("an unsolved challenge is refused, and a solved one is stored", async () => {
  const error = rejection(
    await signupStore({ ...VALID_SIGNUP, altcha: "not-a-solution" } as SignupStoreBody).catch(
      (thrown: unknown) => thrown,
    ),
  );
  expect(error.status).toBe(403);
  expect(error.code).toBe("captcha_failed");

  const result = await signupStore(await solvedSignup({ menus: ["meat", "child"] }));
  expect(result.status).toBe(201);

  setMockUser("demo.admin");
  expect(asSummary((await signupIndex()).data).totalPersons).toBe(8);
});
