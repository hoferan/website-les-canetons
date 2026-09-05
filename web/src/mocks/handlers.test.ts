import { expect, test } from "vitest";

import { authLogin, authLogout, authUser, config, contact } from "../api/generated/endpoints";
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

test("logging in as an unknown username is refused, not a crash", async () => {
  const error = (await authLogin({ username: "nobody", password: "demo" }).catch(
    (thrown: unknown) => thrown,
  )) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(401);
  expect(error.code).toBe("invalid_credentials");
});

test("logging out clears the mocked session", async () => {
  await authLogin({ username: "demo.admin", password: "demo" });
  expect((await authUser()).data).toEqual({ username: "demo.admin", role: "admin" });

  await authLogout();
  const error = (await authUser().catch((thrown: unknown) => thrown)) as ApiError;
  expect(error.status).toBe(401);
});
