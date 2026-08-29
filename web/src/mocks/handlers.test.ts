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
} from "../api/generated/endpoints";
import type { Altcha200 } from "../api/generated/model";
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
  expect(error.status).toBe(422);
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
test("mock state is reset between tests", async () => {
  const result = await eventIndex();
  expect(result.data).toHaveLength(3);
});

type SignupSummary = {
  totalPersons: number;
  totalTables: number;
  menuTotals: { meat: number; child: number; vegetarian: number };
};

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

  expect(payload.salt).toBe((challenge.data as Altcha200).salt);
});

test("the mocked summary groups by table", async () => {
  setMockUser("demo.admin");
  const result = await signupIndex();

  expect(result.status).toBe(200);
  const summary = result.data as SignupSummary;
  expect(summary.totalPersons).toBe(6);
  expect(summary.totalTables).toBe(3);
  expect(summary.menuTotals).toEqual({ meat: 3, child: 1, vegetarian: 2 });
});
