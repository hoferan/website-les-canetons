import { expectTypeOf, test } from "vitest";

import { authMe } from "./generated/endpoints";

/**
 * A COMPILE-TIME guard, not a runtime one.
 *
 * expectTypeOf erases to nothing at runtime, so these assertions are checked by
 * `npm run typecheck` (tsc covers web/src), not by the Vitest run — the test()
 * wrapper exists only to keep the file in the suite's shape.
 *
 * What it pins is ONE HALF of the contract: that orval keeps GENERATING the
 * envelope. It cannot see the other half — `customFetch<T>` returns `Promise<T>`,
 * so whatever the mutator actually builds at runtime is a cast and type-checks
 * either way. That half is pinned by the two runtime tests in http.test.ts
 * ("returns orval's { data, status, headers } envelope" and the 204 one).
 *
 * Both halves matter because they disagreed, silently, for the whole life of
 * the generated client: every call site reading `.data` type-checked and was
 * undefined. Neither guard alone would have caught it.
 *
 * Verified non-vacuous: replacing a property name with a bogus one makes tsc
 * fail with TS2345.
 */
test("the generated response type carries orval's envelope", () => {
  expectTypeOf(authMe).returns.resolves.toHaveProperty("data");
  expectTypeOf(authMe).returns.resolves.toHaveProperty("status");
  expectTypeOf(authMe).returns.resolves.toHaveProperty("headers");
});
