import { expect, test } from "vitest";

import { can } from "./capabilities";

// The negative cases are the reason this file exists. The matrix is not a
// hierarchy, and every intuition about roles says otherwise, so both directions
// are pinned.
test.each([
  ["user", "respond", true],
  ["moderator", "respond", true],
  ["admin", "respond", false],
  ["admin", "manage_events", true],
  ["admin", "view_summary", true],
  ["user", "manage_events", false],
  ["user", "view_summary", false],
  ["moderator", "manage_events", false],
] as const)("%s can %s: %s", (role, capability, expected) => {
  expect(can(role, capability)).toBe(expected);
});

test("an anonymous visitor can do nothing", () => {
  expect(can(null, "respond")).toBe(false);
  expect(can(undefined, "manage_events")).toBe(false);
});

test("a role the matrix has never heard of can do nothing", () => {
  expect(can("superuser", "manage_events")).toBe(false);
});
