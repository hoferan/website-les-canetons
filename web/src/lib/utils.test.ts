import { expect, test } from "vitest";

import { cn } from "./utils";

/**
 * Untold, tailwind-merge keeps a vendored component's shadow-sm next to the
 * caller's shadow-raised, and whichever Tailwind emits last wins.
 */
test("a raised shadow replaces the one a vendored component set", () => {
  expect(cn("shadow-sm", "shadow-raised")).toBe("shadow-raised");
  expect(cn("shadow-raised-sm", "shadow-raised-stage")).toBe("shadow-raised-stage");
});
