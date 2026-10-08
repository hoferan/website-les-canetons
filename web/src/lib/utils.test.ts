import { expect, test } from "vitest";

import { cn } from "./utils";

/**
 * The raised shadows are this theme's own names, which tailwind-merge does
 * not know. Without being told, it keeps a vendored component's shadow-sm
 * next to the caller's shadow-raised, and whichever Tailwind happens to emit
 * last wins.
 */
test("a raised shadow replaces the one a vendored component set", () => {
  expect(cn("shadow-sm", "shadow-raised")).toBe("shadow-raised");
  expect(cn("shadow-raised-sm", "shadow-raised-stage")).toBe("shadow-raised-stage");
});
