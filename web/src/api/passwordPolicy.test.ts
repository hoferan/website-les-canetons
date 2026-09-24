import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

import { MIN_PASSWORD_LENGTH } from "./passwordPolicy";

// Resolved from the Vitest root (the repo root). The committed export is what
// CI's openapi-drift job holds to the Laravel rules, so reading it here chains
// the SPA's number to AccountPasswordRequest without a second copy to forget.
const openapi = JSON.parse(readFileSync(resolve("api/openapi.json"), "utf8")) as {
  components: { schemas: Record<string, { properties: Record<string, { minLength?: number }> }> };
};

test("the length the form announces is the length the API enforces", () => {
  expect(openapi.components.schemas.AccountPasswordRequest?.properties.newPassword?.minLength).toBe(
    MIN_PASSWORD_LENGTH,
  );
});
