import { expectTypeOf, test } from "vitest";

import { authMe } from "./generated/endpoints";

/**
 * A compile-time guard. expectTypeOf erases to nothing at runtime, so
 * `npm run typecheck` checks these assertions, not the Vitest run; the test()
 * wrapper only keeps the file in the suite's shape.
 *
 * It pins half of the contract: that orval keeps generating the envelope.
 * `customFetch<T>` returns `Promise<T>`, so what the mutator builds at runtime
 * type-checks either way; the two runtime tests in http.test.ts ("returns
 * orval's { data, status, headers } envelope" and the 204 one) pin that half.
 * Either half alone lets every `.data` read type-check and be undefined.
 *
 * A bogus property name here makes tsc fail with TS2345.
 */
test("the generated response type carries orval's envelope", () => {
  expectTypeOf(authMe).returns.resolves.toHaveProperty("data");
  expectTypeOf(authMe).returns.resolves.toHaveProperty("status");
  expectTypeOf(authMe).returns.resolves.toHaveProperty("headers");
});
